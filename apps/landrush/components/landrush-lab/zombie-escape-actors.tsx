'use client'

import { LandrushWorldNode } from '@landrush/pascal-plugin'
import { LandrushRobot } from '@landrush/pascal-plugin/landrush-world/robot'
import { useFrame } from '@react-three/fiber'
import { type MutableRefObject, Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  DynamicDrawUsage,
  type Group,
  type InstancedMesh,
  Object3D,
  Quaternion,
  Vector3,
} from 'three'
import {
  createLandrushRobotWeaponCombatState,
  createLandrushRobotWeaponMuzzlePose,
  LandrushRobotWeaponRig,
} from './landrush-robot-weapon-rig'
import {
  resolveZombieEscapeAimReticleElevation,
  resolveZombieEscapeAimReticleYaw,
} from './zombie-escape-aim'
import type { ZombieEscapeQuality } from './zombie-escape-config'
import { ZOMBIE_ESCAPE_DEFAULT_WEAPON } from './zombie-escape-config'
import { ZombieEscapeGeneratedAssets } from './zombie-escape-generated-assets'
import { resolveZombieEscapeHitFlickerPhase } from './zombie-escape-hit-flicker'
import {
  createZombieEscapePresentationPoint,
  createZombieEscapePresentationPose,
  resolveZombieEscapePresentationPose,
  transformZombieEscapePresentationPoint,
  type ZombieEscapePresentationPoint,
  type ZombieEscapePresentationPose,
} from './zombie-escape-presentation-pose'
import {
  getZombieEscapeMeleeProgress,
  restoreZombieEscapeDefaultMuzzlePose,
  setZombieEscapePlayerMuzzlePose,
  type ZombieEscapeSimulation,
} from './zombie-escape-simulation'
import type { ZombieEscapeImpactVisualRegistry } from './zombie-escape-skinned-impact-attachment'
import { ZOMBIE_ESCAPE_ZOMBIE_CATALOG } from './zombie-escape-zombie-catalog'

const ZOMBIE_COLORS = ['#d86d5f', '#d18c55', '#b66073', '#c77745', '#b95f4f'] as const
const ZOMBIE_ESCAPE_RECOIL_DURATION_SECONDS = 0.13
const ZOMBIE_LOCAL_X_AXIS = new Vector3(1, 0, 0)
const ZOMBIE_ASSET_SLOTS = ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map((entry) => ({
  id: entry.id,
  riggedClip: entry.glb.riggedBase.expectedClipName,
  rigged: entry.glb.riggedBase.path,
  runClip: entry.glb.run.expectedClipName,
  run: entry.glb.run.path,
  walkClip: entry.glb.walk.expectedClipName,
  walk: entry.glb.walk.path,
}))

export function ZombieEscapeActors({
  impactVisualRegistry,
  playerColor = '#fff0a2',
  presentationFramePriority,
  quality,
  renderPlayer = true,
  simulationRef,
}: {
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  playerColor?: string
  presentationFramePriority?: number
  quality: ZombieEscapeQuality
  renderPlayer?: boolean
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  const loadedZombieVariantsRef = useRef(new Set<number>())
  return (
    <>
      {renderPlayer ? <ZombieEscapeOrbot simulationRef={simulationRef} /> : null}
      <ZombieEscapeGeneratedAssets
        impactVisualRegistry={impactVisualRegistry}
        loadedZombieVariantsRef={loadedZombieVariantsRef}
        omitHeldWeapon
        quality={quality}
        simulationRef={simulationRef}
        zombiePresentationFramePriority={presentationFramePriority}
      />
      <ZombieEscapeZombieInstances
        framePriority={presentationFramePriority ?? -19}
        loadedZombieVariantsRef={loadedZombieVariantsRef}
        simulationRef={simulationRef}
      />
      <ZombieEscapeAimReticle
        framePriority={presentationFramePriority ?? -18}
        playerColor={playerColor}
        simulationRef={simulationRef}
      />
    </>
  )
}

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
    combatState.recoil = resolveZombieEscapeWeaponRecoil(simulation)
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
      <ZombieEscapeActorRenderDriver />
    </group>
  )
}

function ZombieEscapeActorRenderDriver() {
  useFrame(({ camera, gl, scene }) => {
    gl.render(scene, camera)
  }, 100)
  return null
}

function resolveZombieEscapeWeaponRecoil(simulation: ZombieEscapeSimulation) {
  const slot = simulation.lastShotSlot
  if (slot < 0 || simulation.shots.pool.active[slot] === 0) return 0
  if (simulation.shots.pool.generation[slot] !== simulation.lastShotGeneration) return 0
  const shotAge = simulation.shots.travelAge[slot]! + simulation.shots.impactAge[slot]!
  return Math.max(0, 1 - shotAge / ZOMBIE_ESCAPE_RECOIL_DURATION_SECONDS)
}

function ZombieEscapeZombieInstances({
  framePriority,
  loadedZombieVariantsRef,
  simulationRef,
}: {
  framePriority: number
  loadedZombieVariantsRef: MutableRefObject<Set<number>>
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  const capacity = simulationRef.current.zombies.pool.capacity
  const bodyRef = useRef<InstancedMesh>(null)
  const headRef = useRef<InstancedMesh>(null)
  const leftLegRef = useRef<InstancedMesh>(null)
  const rightLegRef = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const bodyColor = useMemo(() => new Color(), [])
  const headColor = useMemo(() => new Color(), [])
  const legColor = useMemo(() => new Color('#5e4d55'), [])
  const hitBlack = useMemo(() => new Color('#030104'), [])
  const hitRed = useMemo(() => new Color('#ff1738'), [])
  const palette = useMemo(() => ZOMBIE_COLORS.map((value) => new Color(value)), [])
  const presentationPose = useMemo(() => createZombieEscapePresentationPose(), [])
  const presentationPoint = useMemo(() => createZombieEscapePresentationPoint(), [])
  const rootQuaternion = useMemo(() => new Quaternion(), [])
  const localQuaternion = useMemo(() => new Quaternion(), [])

  useLayoutEffect(() => {
    for (const mesh of [
      bodyRef.current,
      headRef.current,
      leftLegRef.current,
      rightLegRef.current,
    ]) {
      mesh?.instanceMatrix.setUsage(DynamicDrawUsage)
    }
  }, [])

  useFrame(() => {
    const simulation = simulationRef.current
    const zombies = simulation.zombies
    for (let index = 0; index < zombies.pool.capacity; index += 1) {
      if (zombies.pool.active[index] === 0) {
        hideZombieInstance(bodyRef.current, index, dummy)
        hideZombieInstance(headRef.current, index, dummy)
        hideZombieInstance(leftLegRef.current, index, dummy)
        hideZombieInstance(rightLegRef.current, index, dummy)
        continue
      }
      const locomotion = zombies.locomotionBlend[index]!
      const runBlend = zombies.runBlend[index]!
      const phase = zombies.locomotionPhase[index]!
      const variant = zombies.variant[index]!
      if (loadedZombieVariantsRef.current.has(variant)) {
        hideZombieInstance(bodyRef.current, index, dummy)
        hideZombieInstance(headRef.current, index, dummy)
        hideZombieInstance(leftLegRef.current, index, dummy)
        hideZombieInstance(rightLegRef.current, index, dummy)
        continue
      }
      resolveZombieEscapePresentationPose(
        zombies.x[index]!,
        0,
        zombies.z[index]!,
        zombies.heading[index]!,
        zombies.hitReaction[index]!,
        zombies.hitImpulseX[index]!,
        zombies.hitImpulseY[index]!,
        zombies.hitImpulseZ[index]!,
        presentationPose,
      )
      rootQuaternion.set(
        presentationPose.quaternionX,
        presentationPose.quaternionY,
        presentationPose.quaternionZ,
        presentationPose.quaternionW,
      )
      const variantScale = 0.93 + (variant % 4) * 0.035
      const bob = Math.abs(Math.sin(phase * 2)) * 0.07 * locomotion
      const lean = 0.12 + runBlend * 0.16
      const stride = Math.sin(phase * 2) * (0.18 + runBlend * 0.2) * locomotion
      const side = 0.19 * variantScale

      applyZombiePresentationInstance(
        bodyRef.current,
        index,
        dummy,
        presentationPose,
        presentationPoint,
        rootQuaternion,
        localQuaternion,
        0,
        0.99 + bob,
        0,
        0.72 * variantScale,
        0.86 * variantScale,
        0.5 * variantScale,
        lean,
      )
      applyZombiePresentationInstance(
        headRef.current,
        index,
        dummy,
        presentationPose,
        presentationPoint,
        rootQuaternion,
        localQuaternion,
        0,
        1.69 + bob,
        0,
        0.34 * variantScale,
        0.34 * variantScale,
        0.34 * variantScale,
        lean * 0.4,
      )
      applyZombiePresentationInstance(
        leftLegRef.current,
        index,
        dummy,
        presentationPose,
        presentationPoint,
        rootQuaternion,
        localQuaternion,
        -side,
        0.39,
        stride,
        0.23,
        0.62,
        0.25,
        stride * 1.7,
      )
      applyZombiePresentationInstance(
        rightLegRef.current,
        index,
        dummy,
        presentationPose,
        presentationPoint,
        rootQuaternion,
        localQuaternion,
        side,
        0.39,
        -stride,
        0.23,
        0.62,
        0.25,
        -stride * 1.7,
      )

      if (simulation.debugMode === 'navigation') {
        const distance = Math.hypot(
          presentationPose.x - simulation.player.x,
          presentationPose.z - simulation.player.z,
        )
        bodyColor.setHSL(Math.min(0.33, distance / 60), 0.9, 0.55)
      } else {
        bodyColor.copy(palette[variant % palette.length] ?? palette[0]!)
      }
      headColor.copy(bodyColor).offsetHSL(0.02, -0.12, 0.12)
      legColor.set('#5e4d55')
      const hitPhase = resolveZombieEscapeHitFlickerPhase(zombies.hitFlash[index]!)
      if (hitPhase !== 'none') {
        const hitColor = hitPhase === 'red' ? hitRed : hitBlack
        bodyColor.copy(hitColor)
        headColor.copy(hitColor)
        legColor.copy(hitColor)
      }
      bodyRef.current?.setColorAt(index, bodyColor)
      headRef.current?.setColorAt(index, headColor)
      leftLegRef.current?.setColorAt(index, legColor)
      rightLegRef.current?.setColorAt(index, legColor)
    }
    markZombieInstanceMeshDirty(bodyRef.current, capacity)
    markZombieInstanceMeshDirty(headRef.current, capacity)
    markZombieInstanceMeshDirty(leftLegRef.current, capacity)
    markZombieInstanceMeshDirty(rightLegRef.current, capacity)
  }, framePriority)

  return (
    <group userData={{ assetSlots: ZOMBIE_ASSET_SLOTS, placeholder: 'procedural-zombie-pool' }}>
      <instancedMesh args={[undefined, undefined, capacity]} frustumCulled={false} ref={bodyRef}>
        <capsuleGeometry args={[0.5, 0.7, 3, 7]} />
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, capacity]} frustumCulled={false} ref={headRef}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, capacity]} frustumCulled={false} ref={leftLegRef}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, capacity]}
        frustumCulled={false}
        ref={rightLegRef}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial />
      </instancedMesh>
    </group>
  )
}

function ZombieEscapeAimReticle({
  framePriority,
  playerColor,
  simulationRef,
}: {
  framePriority: number
  playerColor: string
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  const reticleRef = useRef<Group>(null)
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

function applyZombiePresentationInstance(
  mesh: InstancedMesh | null,
  index: number,
  dummy: Object3D,
  pose: ZombieEscapePresentationPose,
  point: ZombieEscapePresentationPoint,
  rootQuaternion: Quaternion,
  localQuaternion: Quaternion,
  localX: number,
  localY: number,
  localZ: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
  localPitch: number,
) {
  if (!mesh) return
  transformZombieEscapePresentationPoint(pose, localX, localY, localZ, point)
  dummy.position.set(point.x, point.y, point.z)
  localQuaternion.setFromAxisAngle(ZOMBIE_LOCAL_X_AXIS, localPitch)
  dummy.quaternion.copy(rootQuaternion).multiply(localQuaternion)
  dummy.scale.set(scaleX, scaleY, scaleZ)
  dummy.updateMatrix()
  mesh.setMatrixAt(index, dummy.matrix)
}

function hideZombieInstance(mesh: InstancedMesh | null, index: number, dummy: Object3D) {
  if (!mesh) return
  dummy.position.set(0, -30, 0)
  dummy.quaternion.identity()
  dummy.scale.set(0, 0, 0)
  dummy.updateMatrix()
  mesh.setMatrixAt(index, dummy.matrix)
}

function markZombieInstanceMeshDirty(mesh: InstancedMesh | null, capacity: number) {
  if (!mesh) return
  mesh.count = capacity
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}
