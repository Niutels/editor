'use client'

import {
  MAX_MULTIPLAYER_COMBAT_SHOTS,
  type MultiplayerPlayerCombatSnapshot,
} from '@landrush/protocol'
import {
  type MultiplayerRemotePlayerStore,
  REMOTE_PRESENTATION_ANIMATION_SETTLE_SECONDS,
  REMOTE_PRESENTATION_MOVEMENT_FRESH_MS,
  renderScheduler,
  shortestAngleDistance,
} from '@landrush/runtime'
import { ZOMBIE_ESCAPE_SIMULATION } from '@landrush/zombie-gameplay/zombie-escape-config'
import { useFrame } from '@react-three/fiber'
import { type RefObject, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  type BufferGeometry,
  Color,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
  Object3D,
  Vector3,
} from 'three'
import {
  createLandrushRobotWeaponCombatState,
  createLandrushRobotWeaponMuzzlePose,
  type LandrushRobotWeaponCombatState,
  LandrushRobotWeaponRig,
} from './landrush-robot-weapon-rig'
import {
  createZombieEscapeMuzzleFlashTransform,
  resolveZombieEscapeMuzzleFlashTransform,
} from './zombie-escape-muzzle-flash'
import { resolveZombieEscapeWeaponVfxStyle } from './zombie-escape-weapon-vfx'

const UP = new Vector3(0, 1, 0)

export function LandrushZombieEscapeRemoteCombat({
  effectsFramePriority,
  playerId,
  remotePlayerStore,
  visualRootRef,
  weaponFramePriority,
}: {
  effectsFramePriority: number
  playerId: string
  remotePlayerStore: MultiplayerRemotePlayerStore
  visualRootRef: RefObject<Group | null>
  weaponFramePriority: number
}) {
  const rootRef = useRef<Group>(null)
  const poseRef = useRef(createLandrushRobotWeaponCombatState())
  const combatStateRef = useRef<LandrushRobotWeaponCombatState | null>(null)
  const combatSnapshotRef = useRef<MultiplayerPlayerCombatSnapshot | null>(null)
  const muzzlePoseRef = useRef(createLandrushRobotWeaponMuzzlePose())
  const muzzleRef = useRef<Mesh<BufferGeometry, MeshBasicMaterial>>(null)
  const tracersRef = useRef<InstancedMesh>(null)
  const lastUpdatedAtRef = useRef<number | null>(null)
  const lastReceivedAtRef = useRef(0)
  const lastShotSequenceRef = useRef<number | null>(null)
  const muzzleAgeRef = useRef<number>(ZOMBIE_ESCAPE_SIMULATION.muzzleFlashSeconds)
  const settleSecondsRef = useRef(0)
  const scratch = useMemo(
    () => ({
      color: new Color(),
      direction: new Vector3(),
      muzzleTransform: createZombieEscapeMuzzleFlashTransform(),
      transform: new Object3D(),
    }),
    [],
  )

  useFrame((_, delta) => {
    const now = performance.now()
    const raw = remotePlayerStore.getSnapshot(playerId)
    const player = remotePlayerStore.getPresentationSnapshot(playerId, now) ?? raw
    if (raw && raw.updatedAt !== lastUpdatedAtRef.current) {
      lastUpdatedAtRef.current = raw.updatedAt
      lastReceivedAtRef.current = now
    }
    const combat = player?.combat
    const fresh = now - lastReceivedAtRef.current <= REMOTE_PRESENTATION_MOVEMENT_FRESH_MS
    combatSnapshotRef.current = fresh && combat ? combat : null
    muzzleAgeRef.current += Math.min(delta, 0.05)
    if (!player || !combat) {
      combatStateRef.current = null
      lastShotSequenceRef.current = null
      muzzleAgeRef.current = ZOMBIE_ESCAPE_SIMULATION.muzzleFlashSeconds
      return
    }

    const previousSequence = lastShotSequenceRef.current
    const sequenceDelta =
      previousSequence === null ? 0 : (combat.shotSequence - previousSequence) >>> 0
    if (
      fresh &&
      previousSequence !== null &&
      combat.shotSequence !== 0 &&
      sequenceDelta > 0 &&
      sequenceDelta < 0x8000_0000
    ) {
      muzzleAgeRef.current = 0
      settleSecondsRef.current = REMOTE_PRESENTATION_ANIMATION_SETTLE_SECONDS
    }
    lastShotSequenceRef.current = combat.shotSequence
    const pose = poseRef.current
    const meleePhase = fresh ? combat.meleePhase : 'idle'
    if (
      shortestAngleDistance(pose.aimAngle, combat.aimAngle) > 0.001 ||
      pose.weaponIndex !== combat.weaponIndex ||
      pose.meleePhase !== meleePhase
    ) {
      settleSecondsRef.current = REMOTE_PRESENTATION_ANIMATION_SETTLE_SECONDS
    }
    pose.aimAngle = combat.aimAngle
    pose.meleePhase = meleePhase
    pose.meleeProgress = fresh ? combat.meleeProgress : 0
    pose.movementHeading = player.heading
    pose.shotSequence = combat.shotSequence
    pose.weaponIndex = combat.weaponIndex
    combatStateRef.current = pose
    if (rootRef.current) {
      rootRef.current.userData.ammo = combat.ammo
      rootRef.current.userData.weaponIndex = combat.weaponIndex
    }
    settleSecondsRef.current = Math.max(0, settleSecondsRef.current - delta)
    if (
      settleSecondsRef.current > 0 ||
      (fresh && (combat.shots.length > 0 || combat.meleePhase !== 'idle'))
    ) {
      renderScheduler.requestFrame('animation')
    }
  }, weaponFramePriority - 0.01)

  useFrame(() => {
    const combat = combatSnapshotRef.current
    const tracers = tracersRef.current
    let count = 0
    if (tracers) {
      for (const shot of combat?.shots ?? []) {
        const style = resolveZombieEscapeWeaponVfxStyle(shot.weaponIndex)
        const envelope =
          shot.impactAge === null
            ? 1
            : Math.sqrt(
                Math.max(0, 1 - shot.impactAge / ZOMBIE_ESCAPE_SIMULATION.impactLifetimeSeconds),
              )
        scratch.direction
          .fromArray(shot.position)
          .sub(scratch.transform.position.fromArray(shot.previousPosition))
        const length = scratch.direction.length()
        if (length <= 0.0001) continue
        scratch.direction.multiplyScalar(1 / length)
        scratch.transform.position.addScaledVector(scratch.direction, length * 0.5)
        scratch.transform.quaternion.setFromUnitVectors(UP, scratch.direction)
        scratch.transform.scale.set(
          style.tracerRadius * envelope,
          Math.max(style.tracerMinimumHalfLength, (length * 0.5 + 0.055) * style.tracerLengthScale),
          style.tracerRadius * envelope,
        )
        scratch.transform.updateMatrix()
        tracers.setMatrixAt(count, scratch.transform.matrix)
        tracers.setColorAt(count, scratch.color.setHex(style.tracerColor))
        count += 1
      }
      tracers.count = count
      tracers.instanceMatrix.needsUpdate = true
      if (tracers.instanceColor) tracers.instanceColor.needsUpdate = true
    }
    const muzzle = muzzleRef.current
    if (!muzzle) return
    const muzzlePose = muzzlePoseRef.current
    const progress = muzzleAgeRef.current / ZOMBIE_ESCAPE_SIMULATION.muzzleFlashSeconds
    muzzle.visible = Boolean(combat && muzzlePose.ready && progress < 1)
    if (!muzzle.visible || !combat) return
    const style = resolveZombieEscapeWeaponVfxStyle(combat.weaponIndex)
    const envelope = Math.sin(Math.PI * progress) * (1 - progress * 0.25)
    const flash = resolveZombieEscapeMuzzleFlashTransform(
      {
        muzzleDirectionX: muzzlePose.direction.x,
        muzzleDirectionY: muzzlePose.direction.y,
        muzzleDirectionZ: muzzlePose.direction.z,
        muzzleX: muzzlePose.position.x,
        muzzleY: muzzlePose.position.y,
        muzzleZ: muzzlePose.position.z,
      },
      envelope,
      scratch.muzzleTransform,
    )
    const halfLength = flash.scaleY * style.muzzleLengthScale
    muzzle.position.copy(muzzlePose.position).addScaledVector(muzzlePose.direction, halfLength)
    muzzle.quaternion.setFromUnitVectors(UP, muzzlePose.direction)
    muzzle.scale.set(
      flash.scaleX * style.muzzleRadiusScale,
      halfLength,
      flash.scaleZ * style.muzzleRadiusScale,
    )
    muzzle.material.color.setHex(style.muzzleColor)
  }, effectsFramePriority)

  return (
    <group ref={rootRef} userData={{ role: 'landrush-remote-zombie-combat', playerId }}>
      <LandrushRobotWeaponRig
        combatStateRef={combatStateRef}
        framePriority={weaponFramePriority}
        muzzlePoseRef={muzzlePoseRef}
        shoulderTorches={false}
        visualRootRef={visualRootRef}
      />
      <instancedMesh
        args={[undefined, undefined, MAX_MULTIPLAYER_COMBAT_SHOTS]}
        count={0}
        frustumCulled={false}
        ref={tracersRef}
      >
        <sphereGeometry args={[1, 10, 6]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          depthWrite={false}
          opacity={0.92}
          toneMapped={false}
          transparent
        />
      </instancedMesh>
      <mesh frustumCulled={false} ref={muzzleRef} visible={false}>
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          transparent
        />
      </mesh>
    </group>
  )
}
