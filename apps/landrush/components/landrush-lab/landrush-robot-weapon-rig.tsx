'use client'

import { useFrame } from '@react-three/fiber'
import {
  type MutableRefObject,
  memo,
  type RefObject,
  Suspense,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Euler, type Group, MathUtils, Matrix4, type Object3D, Quaternion, Vector3 } from 'three'
import type { LandrushRobotShoulderTorchLightingState } from './landrush-robot-shoulder-torch'
import {
  createLandrushRobotShoulderTorchPoseState,
  type LandrushRobotShoulderTorchPoseState,
  LandrushRobotShoulderTorchRig,
  updateLandrushRobotShoulderTorchPoseState,
} from './landrush-robot-shoulder-torch-rig'
import {
  captureLandrushRobotWeaponRelativeHandQuaternion,
  createLandrushRobotTwoBoneIkScratch,
  type LandrushRobotTwoBoneIkScratch,
  resolveLandrushRobotTwoBoneElbowTarget,
  resolveLandrushRobotWeaponHandQuaternion,
} from './landrush-robot-weapon-arm-kinematics'
import {
  createZombieEscapeMeleePresentationPose,
  dampZombieEscapeAngle,
  resolveZombieEscapeMeleePresentationPose,
  resolveZombieEscapeTorsoAimOffset,
  type ZombieEscapeMeleePhase,
  type ZombieEscapeMeleePresentationPose,
} from './zombie-escape-combat-pose'
import { GeneratedWeaponModel } from './zombie-escape-generated-assets'
import {
  createZombieEscapeHeldWeaponRenderRepresentativeKey,
  type ZombieEscapeRenderReadinessRegistry,
} from './zombie-escape-render-readiness'
import {
  ZOMBIE_ESCAPE_WEAPON_CATALOG,
  type ZombieEscapeWeaponHandFitPose,
  type ZombieEscapeWeaponSpecification,
} from './zombie-escape-weapon-catalog'
import {
  createZombieEscapeWeaponRecoilPose,
  createZombieEscapeWeaponRecoilState,
  resetZombieEscapeWeaponRecoil,
  stepZombieEscapeWeaponRecoil,
} from './zombie-escape-weapon-recoil'

const WORLD_UP = new Vector3(0, 1, 0)
const LOCAL_RIGHT = new Vector3(1, 0, 0)

export type LandrushRobotWeaponCombatState = {
  aimAngle: number
  meleePhase: ZombieEscapeMeleePhase
  meleeProgress: number
  movementHeading: number
  shotSequence: number
  weaponIndex: number
}

export type LandrushRobotWeaponMuzzlePose = {
  direction: Vector3
  position: Vector3
  poseRevision: number
  ready: boolean
  weaponIndex: number
}

export type LandrushRobotWeaponFitAdjustment = {
  offset: readonly [number, number, number]
  rotationDegrees: readonly [number, number, number]
  scale: number
}

export type LandrushRobotWeaponFitSnapshot = {
  leftArmReachMeters: number
  leftArmReachRatio: number
  muzzle: readonly [number, number, number]
  primaryErrorMeters: number
  rightArmReachMeters: number
  rightArmReachRatio: number
  secondaryErrorMeters: number | null
  weaponId: string
}

export function createLandrushRobotWeaponCombatState(): LandrushRobotWeaponCombatState {
  return {
    aimAngle: 0,
    meleePhase: 'idle',
    meleeProgress: 0,
    movementHeading: 0,
    shotSequence: 0,
    weaponIndex: 0,
  }
}

export function createLandrushRobotWeaponMuzzlePose(): LandrushRobotWeaponMuzzlePose {
  return {
    direction: new Vector3(0, 0, 1),
    position: new Vector3(),
    poseRevision: 0,
    ready: false,
    weaponIndex: 0,
  }
}

export function resolveLandrushRobotShoulderTorchDebugContributionEnabled(params: URLSearchParams) {
  return params.get('zombieNightView') !== 'light-contribution'
}

type LandrushRobotArmBones = {
  leftArm: Object3D
  leftForeArm: Object3D
  leftHand: Object3D
  leftShoulder: Object3D
  rightArm: Object3D
  rightForeArm: Object3D
  rightHand: Object3D
  rightShoulder: Object3D
  spine01: Object3D
  spine02: Object3D
}

type LandrushRobotWeaponRigScratch = {
  anchorOffset: Vector3
  armKinematics: LandrushRobotTwoBoneIkScratch
  ballisticForward: Vector3
  ballisticQuaternion: Quaternion
  currentEnd: Vector3
  currentJoint: Vector3
  currentWorldQuaternion: Quaternion
  deltaQuaternion: Quaternion
  desiredWorldQuaternion: Quaternion
  elbowPoleDirection: Vector3
  elbowTarget: Vector3
  fitEuler: Euler
  fitOffset: Vector3
  fitQuaternion: Quaternion
  fromDirection: Vector3
  inverseParentWorldMatrix: Matrix4
  inverseWeaponQuaternion: Quaternion
  leftGripTarget: Vector3
  leftHandPosition: Vector3
  meleePose: ZombieEscapeMeleePresentationPose
  muzzleOffset: Vector3
  palmEuler: Euler
  palmQuaternion: Quaternion
  parentWorldQuaternion: Quaternion
  parentWorldScale: Vector3
  primaryPalmOffset: Vector3
  primaryGripTarget: Vector3
  rightDirection: Vector3
  rightHandPosition: Vector3
  shoulderCenter: Vector3
  shoulderTorchPose: LandrushRobotShoulderTorchPoseState
  secondaryPalmOffset: Vector3
  toDirection: Vector3
  weaponForward: Vector3
  weaponOrigin: Vector3
  weaponQuaternion: Quaternion
  worldDecomposePosition: Vector3
  worldDecomposeScale: Vector3
  wristPosition: Vector3
}

type LandrushRobotWeaponArmBinding = {
  dominantHand: 'left' | 'right'
  initialized: boolean
  primaryElbowPoleWeaponSpace: Vector3
  primaryWeaponRelativeHandQuaternion: Quaternion
  secondaryElbowPoleWeaponSpace: Vector3
  secondaryWeaponRelativeHandQuaternion: Quaternion
  supportHandEnabled: boolean
  weaponIndex: number
}

export const LandrushRobotWeaponRig = memo(function LandrushRobotWeaponRig({
  active = true,
  combatStateRef,
  debug = false,
  dominantHand = 'right',
  fitAdjustment,
  framePriority = 2.5,
  muzzlePoseRef,
  onFitSnapshot,
  renderReadinessRegistry,
  shoulderTorchLightingStateRef,
  shoulderTorches = true,
  supportHandEnabled = true,
  visualRootRef,
}: {
  active?: boolean
  combatStateRef: RefObject<LandrushRobotWeaponCombatState | null>
  debug?: boolean
  dominantHand?: 'left' | 'right'
  fitAdjustment?: LandrushRobotWeaponFitAdjustment
  framePriority?: number
  muzzlePoseRef: MutableRefObject<LandrushRobotWeaponMuzzlePose>
  onFitSnapshot?: (snapshot: LandrushRobotWeaponFitSnapshot) => void
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  shoulderTorchLightingStateRef?: RefObject<LandrushRobotShoulderTorchLightingState>
  shoulderTorches?: boolean
  supportHandEnabled?: boolean
  visualRootRef: RefObject<Group | null>
}) {
  const weaponRootRef = useRef<Group>(null)
  const weaponVisualRefs = useRef<Array<Group | null>>([])
  const primaryTargetMarkerRef = useRef<Group>(null)
  const secondaryTargetMarkerRef = useRef<Group>(null)
  const primaryHandMarkerRef = useRef<Group>(null)
  const secondaryHandMarkerRef = useRef<Group>(null)
  const bonesRef = useRef<LandrushRobotArmBones | null>(null)
  const bonesRootRef = useRef<Object3D | null>(null)
  const torsoAimOffsetRef = useRef(0)
  const snapshotFrameRef = useRef(0)
  const scratch = useMemo<LandrushRobotWeaponRigScratch>(
    () => ({
      anchorOffset: new Vector3(),
      armKinematics: createLandrushRobotTwoBoneIkScratch(),
      ballisticForward: new Vector3(),
      ballisticQuaternion: new Quaternion(),
      currentEnd: new Vector3(),
      currentJoint: new Vector3(),
      currentWorldQuaternion: new Quaternion(),
      deltaQuaternion: new Quaternion(),
      desiredWorldQuaternion: new Quaternion(),
      elbowPoleDirection: new Vector3(),
      elbowTarget: new Vector3(),
      fitEuler: new Euler(),
      fitOffset: new Vector3(),
      fitQuaternion: new Quaternion(),
      fromDirection: new Vector3(),
      inverseParentWorldMatrix: new Matrix4(),
      inverseWeaponQuaternion: new Quaternion(),
      leftGripTarget: new Vector3(),
      leftHandPosition: new Vector3(),
      meleePose: createZombieEscapeMeleePresentationPose(),
      muzzleOffset: new Vector3(),
      palmEuler: new Euler(),
      palmQuaternion: new Quaternion(),
      parentWorldQuaternion: new Quaternion(),
      parentWorldScale: new Vector3(),
      primaryPalmOffset: new Vector3(),
      primaryGripTarget: new Vector3(),
      rightDirection: new Vector3(),
      rightHandPosition: new Vector3(),
      shoulderCenter: new Vector3(),
      shoulderTorchPose: createLandrushRobotShoulderTorchPoseState(),
      secondaryPalmOffset: new Vector3(),
      toDirection: new Vector3(),
      weaponForward: new Vector3(),
      weaponOrigin: new Vector3(),
      weaponQuaternion: new Quaternion(),
      worldDecomposePosition: new Vector3(),
      worldDecomposeScale: new Vector3(),
      wristPosition: new Vector3(),
    }),
    [],
  )
  const shoulderTorchPoseRef = useRef(scratch.shoulderTorchPose)
  const armBindingRef = useRef<LandrushRobotWeaponArmBinding>({
    dominantHand,
    initialized: false,
    primaryElbowPoleWeaponSpace: new Vector3(),
    primaryWeaponRelativeHandQuaternion: new Quaternion(),
    secondaryElbowPoleWeaponSpace: new Vector3(),
    secondaryWeaponRelativeHandQuaternion: new Quaternion(),
    supportHandEnabled,
    weaponIndex: -1,
  })
  const recoilStateRef = useRef(createZombieEscapeWeaponRecoilState())
  const recoilPoseRef = useRef(createZombieEscapeWeaponRecoilPose())
  const [shoulderTorchContributionEnabled] = useState(() =>
    typeof window === 'undefined'
      ? true
      : resolveLandrushRobotShoulderTorchDebugContributionEnabled(
          new URLSearchParams(window.location.search),
        ),
  )

  useFrame((_, delta) => {
    scratch.shoulderTorchPose.ready = false
    const weaponRoot = weaponRootRef.current
    const visualRoot = visualRootRef.current
    const combatState = combatStateRef.current
    if (bonesRootRef.current !== visualRoot) {
      bonesRootRef.current = visualRoot
      bonesRef.current = null
    }
    const bones = visualRoot ? (bonesRef.current ?? findLandrushRobotArmBones(visualRoot)) : null
    bonesRef.current = bones
    if (!active) {
      if (weaponRoot) weaponRoot.visible = false
      armBindingRef.current.initialized = false
      muzzlePoseRef.current.ready = false
      resetZombieEscapeWeaponRecoil(
        recoilStateRef.current,
        combatState?.weaponIndex ?? 0,
        combatState?.shotSequence ?? 0,
      )
      return
    }
    if (!weaponRoot || !visualRoot || !combatState || !bones) {
      if (weaponRoot) weaponRoot.visible = false
      armBindingRef.current.initialized = false
      muzzlePoseRef.current.ready = false
      return
    }

    const weaponIndex = MathUtils.clamp(
      Math.trunc(combatState.weaponIndex),
      0,
      ZOMBIE_ESCAPE_WEAPON_CATALOG.length - 1,
    )
    const weapon = ZOMBIE_ESCAPE_WEAPON_CATALOG[weaponIndex]
    if (!weapon) {
      weaponRoot.visible = false
      armBindingRef.current.initialized = false
      muzzlePoseRef.current.ready = false
      return
    }

    weaponRoot.visible = true
    const meleeActive = combatState.meleePhase !== 'idle'
    for (let index = 0; index < weaponVisualRefs.current.length; index += 1) {
      const visual = weaponVisualRefs.current[index]
      if (visual) visual.visible = index === weaponIndex
    }

    const torsoAimTarget = resolveZombieEscapeTorsoAimOffset(
      combatState.aimAngle,
      combatState.movementHeading,
    )
    torsoAimOffsetRef.current = dampZombieEscapeAngle(
      torsoAimOffsetRef.current,
      torsoAimTarget,
      13,
      delta,
    )
    scratch.deltaQuaternion.setFromAxisAngle(WORLD_UP, torsoAimOffsetRef.current * 0.42)
    bones.spine01.quaternion.multiply(scratch.deltaQuaternion).normalize()
    scratch.deltaQuaternion.setFromAxisAngle(WORLD_UP, torsoAimOffsetRef.current * 0.58)
    bones.spine02.quaternion.multiply(scratch.deltaQuaternion).normalize()
    visualRoot.updateWorldMatrix(true, true)
    const shoulderTorchPose = updateLandrushRobotShoulderTorchPoseState(
      scratch.shoulderTorchPose,
      visualRoot,
      bones.leftShoulder.matrixWorld,
      bones.rightShoulder.matrixWorld,
      visualRoot.matrixWorld,
    )
    scratch.shoulderCenter
      .copy(shoulderTorchPose.leftShoulder)
      .add(shoulderTorchPose.rightShoulder)
      .multiplyScalar(0.5)

    const fitScale = MathUtils.clamp(fitAdjustment?.scale ?? 1, 0.35, 1.75)
    scratch.fitEuler.set(
      MathUtils.degToRad(fitAdjustment?.rotationDegrees[0] ?? 0),
      MathUtils.degToRad(fitAdjustment?.rotationDegrees[1] ?? 0),
      MathUtils.degToRad(fitAdjustment?.rotationDegrees[2] ?? 0),
      'XYZ',
    )
    scratch.fitQuaternion.setFromEuler(scratch.fitEuler)
    const meleePose = resolveZombieEscapeMeleePresentationPose(
      combatState.meleePhase,
      combatState.meleeProgress,
      scratch.meleePose,
    )
    scratch.weaponQuaternion.setFromAxisAngle(WORLD_UP, combatState.aimAngle + meleePose.yawOffset)
    scratch.weaponForward.set(0, 0, 1).applyQuaternion(scratch.weaponQuaternion)
    scratch.deltaQuaternion.setFromAxisAngle(scratch.weaponForward, meleePose.roll)
    scratch.weaponQuaternion.premultiply(scratch.deltaQuaternion).multiply(scratch.fitQuaternion)
    scratch.ballisticQuaternion.copy(scratch.weaponQuaternion)
    scratch.ballisticForward.set(0, 0, 1).applyQuaternion(scratch.ballisticQuaternion)
    const primaryArm = dominantHand === 'right' ? bones.rightArm : bones.leftArm
    const primaryForeArm = dominantHand === 'right' ? bones.rightForeArm : bones.leftForeArm
    const primaryHand = dominantHand === 'right' ? bones.rightHand : bones.leftHand
    const secondaryArm = dominantHand === 'right' ? bones.leftArm : bones.rightArm
    const secondaryForeArm = dominantHand === 'right' ? bones.leftForeArm : bones.rightForeArm
    const secondaryHand = dominantHand === 'right' ? bones.leftHand : bones.rightHand
    const armBinding = armBindingRef.current
    if (!armBinding.initialized) {
      resetZombieEscapeWeaponRecoil(recoilStateRef.current, weaponIndex, combatState.shotSequence)
    }
    if (
      !armBinding.initialized ||
      armBinding.weaponIndex !== weaponIndex ||
      armBinding.dominantHand !== dominantHand ||
      armBinding.supportHandEnabled !== supportHandEnabled
    ) {
      scratch.inverseWeaponQuaternion.copy(scratch.ballisticQuaternion).invert()
      readLandrushRobotWorldQuaternion(primaryHand, scratch.currentWorldQuaternion, scratch)
      captureLandrushRobotWeaponRelativeHandQuaternion(
        scratch.ballisticQuaternion,
        scratch.currentWorldQuaternion,
        armBinding.primaryWeaponRelativeHandQuaternion,
      )
      readLandrushRobotWorldQuaternion(secondaryHand, scratch.currentWorldQuaternion, scratch)
      captureLandrushRobotWeaponRelativeHandQuaternion(
        scratch.ballisticQuaternion,
        scratch.currentWorldQuaternion,
        armBinding.secondaryWeaponRelativeHandQuaternion,
      )
      scratch.currentJoint.setFromMatrixPosition(primaryArm.matrixWorld)
      scratch.currentEnd.setFromMatrixPosition(primaryForeArm.matrixWorld)
      armBinding.primaryElbowPoleWeaponSpace
        .copy(scratch.currentEnd)
        .sub(scratch.currentJoint)
        .applyQuaternion(scratch.inverseWeaponQuaternion)
      scratch.currentJoint.setFromMatrixPosition(secondaryArm.matrixWorld)
      scratch.currentEnd.setFromMatrixPosition(secondaryForeArm.matrixWorld)
      armBinding.secondaryElbowPoleWeaponSpace
        .copy(scratch.currentEnd)
        .sub(scratch.currentJoint)
        .applyQuaternion(scratch.inverseWeaponQuaternion)
      armBinding.dominantHand = dominantHand
      armBinding.initialized = true
      armBinding.supportHandEnabled = supportHandEnabled
      armBinding.weaponIndex = weaponIndex
    }
    const recoilPose = stepZombieEscapeWeaponRecoil(
      recoilStateRef.current,
      {
        deltaSeconds: delta,
        shotSequence: combatState.shotSequence,
        weaponIndex,
      },
      recoilPoseRef.current,
    )
    scratch.deltaQuaternion.setFromAxisAngle(LOCAL_RIGHT, -recoilPose.muzzleClimbRadians)
    scratch.weaponQuaternion.multiply(scratch.deltaQuaternion).normalize()
    scratch.weaponForward.set(0, 0, 1).applyQuaternion(scratch.weaponQuaternion)
    scratch.rightDirection.set(1, 0, 0).applyQuaternion(scratch.weaponQuaternion)
    const handSide = dominantHand === 'right' ? -1 : 1
    scratch.primaryGripTarget
      .copy(scratch.shoulderCenter)
      .addScaledVector(
        scratch.ballisticForward,
        0.38 - recoilPose.backwardTravelMeters + meleePose.forwardOffset,
      )
      .addScaledVector(
        scratch.rightDirection,
        handSide * (weapon.wield === 'one-hand' ? 0.2 : 0.15),
      )
      .addScaledVector(
        WORLD_UP,
        (weapon.wield === 'one-hand' ? -0.27 : -0.3) + meleePose.liftOffset,
      )
    scratch.fitOffset
      .fromArray(fitAdjustment?.offset ?? [0, 0, 0])
      .applyAxisAngle(WORLD_UP, combatState.aimAngle)
    scratch.primaryGripTarget.add(scratch.fitOffset)

    scratch.anchorOffset
      .fromArray(weapon.grip.primaryAnchorMeters)
      .multiplyScalar(fitScale)
      .applyQuaternion(scratch.weaponQuaternion)
    scratch.primaryPalmOffset
      .fromArray(weapon.handFitDefaults.primary.palmOffsetMeters)
      .multiplyScalar(fitScale)
      .applyQuaternion(scratch.weaponQuaternion)
    scratch.secondaryPalmOffset
      .fromArray(weapon.handFitDefaults.secondary?.palmOffsetMeters ?? [0, 0, 0])
      .multiplyScalar(fitScale)
      .applyQuaternion(scratch.weaponQuaternion)
    scratch.weaponOrigin
      .copy(scratch.primaryGripTarget)
      .sub(scratch.anchorOffset)
      .sub(scratch.primaryPalmOffset)
    scratch.leftGripTarget
      .fromArray(weapon.grip.secondaryAnchorMeters ?? weapon.grip.primaryAnchorMeters)
      .multiplyScalar(fitScale)
      .applyQuaternion(scratch.weaponQuaternion)
      .add(scratch.weaponOrigin)
      .add(scratch.secondaryPalmOffset)

    solveLandrushRobotArmToTarget(
      primaryArm,
      primaryForeArm,
      primaryHand,
      scratch.primaryGripTarget,
      armBinding.primaryElbowPoleWeaponSpace,
      scratch.ballisticQuaternion,
      scratch,
    )
    if (weapon.grip.secondaryAnchorMeters && supportHandEnabled) {
      solveLandrushRobotArmToTarget(
        secondaryArm,
        secondaryForeArm,
        secondaryHand,
        scratch.leftGripTarget,
        armBinding.secondaryElbowPoleWeaponSpace,
        scratch.ballisticQuaternion,
        scratch,
      )
    }

    scratch.rightHandPosition.setFromMatrixPosition(primaryHand.matrixWorld)
    scratch.weaponOrigin
      .copy(scratch.rightHandPosition)
      .sub(scratch.anchorOffset)
      .sub(scratch.primaryPalmOffset)
    if (weapon.grip.secondaryAnchorMeters && supportHandEnabled) {
      scratch.leftGripTarget
        .fromArray(weapon.grip.secondaryAnchorMeters)
        .multiplyScalar(fitScale)
        .applyQuaternion(scratch.weaponQuaternion)
        .add(scratch.weaponOrigin)
        .add(scratch.secondaryPalmOffset)
      solveLandrushRobotArmToTarget(
        secondaryArm,
        secondaryForeArm,
        secondaryHand,
        scratch.leftGripTarget,
        armBinding.secondaryElbowPoleWeaponSpace,
        scratch.ballisticQuaternion,
        scratch,
      )
    }
    applyLandrushRobotPalmPose(
      primaryHand,
      weapon.handFitDefaults.primary,
      dominantHand === 'left',
      scratch.weaponQuaternion,
      armBinding.primaryWeaponRelativeHandQuaternion,
      scratch,
    )
    if (weapon.handFitDefaults.secondary && supportHandEnabled) {
      applyLandrushRobotPalmPose(
        secondaryHand,
        weapon.handFitDefaults.secondary,
        dominantHand === 'left',
        scratch.weaponQuaternion,
        armBinding.secondaryWeaponRelativeHandQuaternion,
        scratch,
      )
    }
    applyWorldWeaponTransform(
      weaponRoot,
      scratch.weaponOrigin,
      scratch.weaponQuaternion,
      fitScale,
      scratch,
    )

    const muzzlePose = muzzlePoseRef.current
    scratch.muzzleOffset
      .fromArray(weapon.muzzle.anchorMeters)
      .multiplyScalar(fitScale)
      .applyQuaternion(scratch.weaponQuaternion)
    muzzlePose.position.copy(scratch.weaponOrigin).add(scratch.muzzleOffset)
    muzzlePose.direction
      .fromArray(weapon.muzzle.forwardAxis)
      .applyQuaternion(scratch.ballisticQuaternion)
      .normalize()
    muzzlePose.poseRevision += 1
    muzzlePose.ready = !meleeActive
    muzzlePose.weaponIndex = weaponIndex

    if (debug || onFitSnapshot) {
      scratch.leftHandPosition.setFromMatrixPosition(secondaryHand.matrixWorld)
      updateMarker(primaryTargetMarkerRef.current, scratch.primaryGripTarget)
      updateMarker(secondaryTargetMarkerRef.current, scratch.leftGripTarget)
      updateMarker(primaryHandMarkerRef.current, scratch.rightHandPosition)
      updateMarker(secondaryHandMarkerRef.current, scratch.leftHandPosition)
      const fitSnapshot = createWeaponFitDebugSnapshot(
        weapon,
        bones,
        scratch.rightHandPosition,
        scratch.primaryGripTarget,
        scratch.leftHandPosition,
        scratch.leftGripTarget,
        muzzlePose,
        supportHandEnabled,
      )
      weaponRoot.userData.weaponFit = fitSnapshot
      snapshotFrameRef.current += 1
      if (onFitSnapshot && snapshotFrameRef.current % 8 === 0) onFitSnapshot(fitSnapshot)
    }
  }, framePriority)

  return (
    <>
      {shoulderTorches ? (
        <LandrushRobotShoulderTorchRig
          active={active && shoulderTorchContributionEnabled}
          combatStateRef={combatStateRef}
          emitSpotLights={shoulderTorchContributionEnabled}
          framePriority={framePriority + 0.005}
          lightingStateRef={shoulderTorchLightingStateRef}
          poseStateRef={shoulderTorchPoseRef}
          renderReadinessRegistry={renderReadinessRegistry}
          showBeams={shoulderTorchContributionEnabled}
          showFixtures={shoulderTorchContributionEnabled}
          visualRootRef={visualRootRef}
        />
      ) : null}
      <group
        ref={weaponRootRef}
        userData={{ role: 'landrush-robot-mounted-weapon' }}
        visible={active}
      >
        {ZOMBIE_ESCAPE_WEAPON_CATALOG.map((weapon, index) => (
          <group
            key={weapon.id}
            ref={(group) => {
              weaponVisualRefs.current[index] = group
            }}
            visible={index === 0}
          >
            <Suspense fallback={null}>
              <GeneratedWeaponModel
                renderReadinessRegistry={renderReadinessRegistry}
                renderRepresentativeKey={createZombieEscapeHeldWeaponRenderRepresentativeKey(
                  weapon.id,
                )}
                weapon={weapon}
              />
            </Suspense>
          </group>
        ))}
      </group>
      {debug ? (
        <group userData={{ role: 'landrush-robot-weapon-fit-markers' }}>
          <FitMarker color="#63f3ff" ref={primaryTargetMarkerRef} />
          <FitMarker color="#9cf778" ref={secondaryTargetMarkerRef} />
          <FitMarker color="#ffffff" ref={primaryHandMarkerRef} />
          <FitMarker color="#ffcf66" ref={secondaryHandMarkerRef} />
        </group>
      ) : null}
    </>
  )
})

function FitMarker({ color, ref }: { color: string; ref: RefObject<Group | null> }) {
  return (
    <group ref={ref}>
      <mesh>
        <octahedronGeometry args={[0.035, 0]} />
        <meshBasicMaterial color={color} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

function findLandrushRobotArmBones(root: Object3D): LandrushRobotArmBones | null {
  const byName = new Map<string, Object3D>()
  root.traverse((object) => byName.set(object.name.toLowerCase(), object))
  const leftArm = byName.get('leftarm')
  const leftForeArm = byName.get('leftforearm')
  const leftHand = byName.get('lefthand')
  const leftShoulder = byName.get('leftshoulder')
  const rightArm = byName.get('rightarm')
  const rightForeArm = byName.get('rightforearm')
  const rightHand = byName.get('righthand')
  const rightShoulder = byName.get('rightshoulder')
  const spine01 = byName.get('spine01')
  const spine02 = byName.get('spine02')
  if (
    !leftArm ||
    !leftForeArm ||
    !leftHand ||
    !leftShoulder ||
    !rightArm ||
    !rightForeArm ||
    !rightHand ||
    !rightShoulder ||
    !spine01 ||
    !spine02
  ) {
    return null
  }
  return {
    leftArm,
    leftForeArm,
    leftHand,
    leftShoulder,
    rightArm,
    rightForeArm,
    rightHand,
    rightShoulder,
    spine01,
    spine02,
  }
}

function solveLandrushRobotArmToTarget(
  upperArm: Object3D,
  foreArm: Object3D,
  hand: Object3D,
  target: Vector3,
  elbowPoleWeaponSpace: Vector3,
  weaponQuaternion: Quaternion,
  scratch: LandrushRobotWeaponRigScratch,
) {
  scratch.currentJoint.setFromMatrixPosition(upperArm.matrixWorld)
  scratch.currentEnd.setFromMatrixPosition(foreArm.matrixWorld)
  scratch.wristPosition.setFromMatrixPosition(hand.matrixWorld)
  const upperArmLength = scratch.currentJoint.distanceTo(scratch.currentEnd)
  const foreArmLength = scratch.currentEnd.distanceTo(scratch.wristPosition)
  scratch.elbowPoleDirection.copy(elbowPoleWeaponSpace).applyQuaternion(weaponQuaternion)
  resolveLandrushRobotTwoBoneElbowTarget(
    scratch.currentJoint,
    target,
    upperArmLength,
    foreArmLength,
    scratch.elbowPoleDirection,
    scratch.elbowTarget,
    scratch.armKinematics,
  )
  rotateLandrushRobotJointTowardTarget(upperArm, foreArm, scratch.elbowTarget, scratch)
  rotateLandrushRobotJointTowardTarget(foreArm, hand, target, scratch)
}

function rotateLandrushRobotJointTowardTarget(
  joint: Object3D,
  hand: Object3D,
  target: Vector3,
  scratch: LandrushRobotWeaponRigScratch,
) {
  const parent = joint.parent
  if (!parent) return
  scratch.currentEnd.setFromMatrixPosition(hand.matrixWorld)
  scratch.currentJoint.setFromMatrixPosition(joint.matrixWorld)
  scratch.fromDirection.copy(scratch.currentEnd).sub(scratch.currentJoint)
  scratch.toDirection.copy(target).sub(scratch.currentJoint)
  if (
    scratch.fromDirection.lengthSq() <= 0.000_000_1 ||
    scratch.toDirection.lengthSq() <= 0.000_000_1
  ) {
    return
  }
  scratch.fromDirection.normalize()
  scratch.toDirection.normalize()
  scratch.deltaQuaternion.setFromUnitVectors(scratch.fromDirection, scratch.toDirection)
  readLandrushRobotWorldQuaternion(joint, scratch.currentWorldQuaternion, scratch)
  scratch.desiredWorldQuaternion
    .copy(scratch.deltaQuaternion)
    .multiply(scratch.currentWorldQuaternion)
    .normalize()
  readLandrushRobotWorldQuaternion(parent, scratch.parentWorldQuaternion, scratch)
  scratch.parentWorldQuaternion.invert()
  joint.quaternion
    .copy(scratch.parentWorldQuaternion)
    .multiply(scratch.desiredWorldQuaternion)
    .normalize()
  joint.updateWorldMatrix(false, true)
}

function readLandrushRobotWorldQuaternion(
  object: Object3D,
  target: Quaternion,
  scratch: LandrushRobotWeaponRigScratch,
) {
  object.matrixWorld.decompose(scratch.worldDecomposePosition, target, scratch.worldDecomposeScale)
  return target
}

function updateMarker(marker: Group | null, position: Vector3) {
  if (marker) marker.position.copy(position)
}

function applyWorldWeaponTransform(
  weaponRoot: Group,
  worldPosition: Vector3,
  worldQuaternion: Quaternion,
  worldScale: number,
  scratch: LandrushRobotWeaponRigScratch,
) {
  const parent = weaponRoot.parent
  if (!parent) {
    weaponRoot.position.copy(worldPosition)
    weaponRoot.quaternion.copy(worldQuaternion)
    weaponRoot.scale.setScalar(worldScale)
    return
  }

  parent.updateWorldMatrix(true, false)
  scratch.inverseParentWorldMatrix.copy(parent.matrixWorld).invert()
  weaponRoot.position.copy(worldPosition).applyMatrix4(scratch.inverseParentWorldMatrix)
  parent.matrixWorld.decompose(
    scratch.worldDecomposePosition,
    scratch.parentWorldQuaternion,
    scratch.parentWorldScale,
  )
  scratch.parentWorldQuaternion.invert()
  weaponRoot.quaternion.copy(scratch.parentWorldQuaternion).multiply(worldQuaternion).normalize()
  weaponRoot.scale.set(
    worldScale / Math.max(0.000_001, Math.abs(scratch.parentWorldScale.x)),
    worldScale / Math.max(0.000_001, Math.abs(scratch.parentWorldScale.y)),
    worldScale / Math.max(0.000_001, Math.abs(scratch.parentWorldScale.z)),
  )
}

function applyLandrushRobotPalmPose(
  hand: Object3D,
  pose: ZombieEscapeWeaponHandFitPose,
  mirrored: boolean,
  weaponQuaternion: Quaternion,
  weaponRelativeHandQuaternion: Quaternion,
  scratch: LandrushRobotWeaponRigScratch,
) {
  const parent = hand.parent
  if (!parent) return
  const rotation = pose.palmRotationEulerDegrees
  scratch.palmEuler.set(
    MathUtils.degToRad(rotation[0]),
    MathUtils.degToRad(mirrored ? -rotation[1] : rotation[1]),
    MathUtils.degToRad(mirrored ? -rotation[2] : rotation[2]),
    'XYZ',
  )
  scratch.palmQuaternion.setFromEuler(scratch.palmEuler)
  resolveLandrushRobotWeaponHandQuaternion(
    weaponQuaternion,
    scratch.palmQuaternion,
    weaponRelativeHandQuaternion,
    scratch.desiredWorldQuaternion,
  )
  readLandrushRobotWorldQuaternion(parent, scratch.parentWorldQuaternion, scratch).invert()
  scratch.deltaQuaternion
    .copy(scratch.parentWorldQuaternion)
    .multiply(scratch.desiredWorldQuaternion)
    .normalize()
  if (hand.quaternion.dot(scratch.deltaQuaternion) < 0) {
    scratch.deltaQuaternion.set(
      -scratch.deltaQuaternion.x,
      -scratch.deltaQuaternion.y,
      -scratch.deltaQuaternion.z,
      -scratch.deltaQuaternion.w,
    )
  }
  hand.quaternion.copy(scratch.deltaQuaternion)
  hand.updateWorldMatrix(false, true)
}

function createWeaponFitDebugSnapshot(
  weapon: ZombieEscapeWeaponSpecification,
  bones: LandrushRobotArmBones,
  primaryHand: Vector3,
  primaryTarget: Vector3,
  secondaryHand: Vector3,
  secondaryTarget: Vector3,
  muzzlePose: LandrushRobotWeaponMuzzlePose,
  supportHandEnabled: boolean,
): LandrushRobotWeaponFitSnapshot {
  const rightReach = measureLandrushRobotArm(bones.rightArm, bones.rightForeArm, bones.rightHand)
  const leftReach = measureLandrushRobotArm(bones.leftArm, bones.leftForeArm, bones.leftHand)
  const rightRequestedReach = rightReach.shoulder.distanceTo(primaryTarget)
  const leftRequestedReach = leftReach.shoulder.distanceTo(secondaryTarget)
  return {
    leftArmReachMeters: leftRequestedReach,
    leftArmReachRatio:
      leftReach.maximum > Number.EPSILON ? leftRequestedReach / leftReach.maximum : 0,
    muzzle: muzzlePose.position.toArray(),
    primaryErrorMeters: primaryHand.distanceTo(primaryTarget),
    rightArmReachMeters: rightRequestedReach,
    rightArmReachRatio:
      rightReach.maximum > Number.EPSILON ? rightRequestedReach / rightReach.maximum : 0,
    secondaryErrorMeters:
      weapon.grip.secondaryAnchorMeters && supportHandEnabled
        ? secondaryHand.distanceTo(secondaryTarget)
        : null,
    weaponId: weapon.id,
  }
}

function measureLandrushRobotArm(upperArm: Object3D, foreArm: Object3D, hand: Object3D) {
  const shoulder = upperArm.getWorldPosition(new Vector3())
  const elbow = foreArm.getWorldPosition(new Vector3())
  const wrist = hand.getWorldPosition(new Vector3())
  return {
    maximum: shoulder.distanceTo(elbow) + elbow.distanceTo(wrist),
    shoulder,
  }
}
