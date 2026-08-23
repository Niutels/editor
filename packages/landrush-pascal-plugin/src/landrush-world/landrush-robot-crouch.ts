import { type Group, type Object3D, Quaternion, Vector3 } from 'three'

const LANDRUSH_ROBOT_CROUCH_UPPER_LEG_PITCH = -1.55
const LANDRUSH_ROBOT_CROUCH_KNEE_PITCH = 2.85
const LANDRUSH_ROBOT_CROUCH_FOOT_PITCH = -1.35
const LANDRUSH_ROBOT_CROUCH_SPINE_PITCH = 0.9
const LANDRUSH_ROBOT_CROUCH_SOLE_BIAS_METERS = 0.025
const LANDRUSH_ROBOT_CROUCH_SUPPORT_PROBE_Y = [-16, 0, 16, 32] as const
const LANDRUSH_ROBOT_CROUCH_TOE_PROBE_Y = [0, 16, 32] as const
const LANDRUSH_ROBOT_CROUCH_SUPPORT_PROBE_Z = 4.5

type LandrushRobotCrouchBoneState = {
  bone: Object3D
  pitch: number
  quaternion: Quaternion
}

type LandrushRobotCrouchSupportProbe = {
  bone: Object3D
  point: Vector3
}

export type LandrushRobotCrouchRig = {
  boneStates: LandrushRobotCrouchBoneState[]
  hips: Object3D
  hipsParent: Object3D
  hipsPosition: Vector3
  localOrigin: Vector3
  localTarget: Vector3
  poseApplied: boolean
  supportProbes: LandrushRobotCrouchSupportProbe[]
  worldOrigin: Vector3
  worldProbe: Vector3
  worldTarget: Vector3
}

export function createLandrushRobotCrouchRig(root: Group): LandrushRobotCrouchRig | null {
  const bones = new Map<string, Object3D>()
  root.traverse((child) => {
    if ((child as Object3D & { isBone?: boolean }).isBone) {
      bones.set(child.name.toLowerCase(), child)
    }
  })

  const hips = bones.get('hips')
  const poseBones = [
    { bone: bones.get('leftupleg'), pitch: LANDRUSH_ROBOT_CROUCH_UPPER_LEG_PITCH },
    { bone: bones.get('rightupleg'), pitch: LANDRUSH_ROBOT_CROUCH_UPPER_LEG_PITCH },
    { bone: bones.get('leftleg'), pitch: LANDRUSH_ROBOT_CROUCH_KNEE_PITCH },
    { bone: bones.get('rightleg'), pitch: LANDRUSH_ROBOT_CROUCH_KNEE_PITCH },
    { bone: bones.get('leftfoot'), pitch: LANDRUSH_ROBOT_CROUCH_FOOT_PITCH },
    { bone: bones.get('rightfoot'), pitch: LANDRUSH_ROBOT_CROUCH_FOOT_PITCH },
    { bone: bones.get('spine02'), pitch: LANDRUSH_ROBOT_CROUCH_SPINE_PITCH * 0.55 },
    { bone: bones.get('spine01'), pitch: LANDRUSH_ROBOT_CROUCH_SPINE_PITCH * 0.3 },
    { bone: bones.get('spine'), pitch: LANDRUSH_ROBOT_CROUCH_SPINE_PITCH * 0.15 },
  ]
  const leftFoot = bones.get('leftfoot')
  const rightFoot = bones.get('rightfoot')
  const leftToe = bones.get('lefttoebase')
  const rightToe = bones.get('righttoebase')
  if (!(hips?.parent && leftFoot && rightFoot && leftToe && rightToe)) return null
  if (poseBones.some(({ bone }) => !bone)) return null

  const supportProbes: LandrushRobotCrouchSupportProbe[] = []
  for (const foot of [leftFoot, rightFoot]) {
    for (const y of LANDRUSH_ROBOT_CROUCH_SUPPORT_PROBE_Y) {
      supportProbes.push({
        bone: foot,
        point: new Vector3(0, y, LANDRUSH_ROBOT_CROUCH_SUPPORT_PROBE_Z),
      })
    }
  }
  for (const toe of [leftToe, rightToe]) {
    for (const y of LANDRUSH_ROBOT_CROUCH_TOE_PROBE_Y) {
      supportProbes.push({
        bone: toe,
        point: new Vector3(0, y, LANDRUSH_ROBOT_CROUCH_SUPPORT_PROBE_Z),
      })
    }
  }

  return {
    boneStates: poseBones.map(({ bone, pitch }) => ({
      bone: bone as Object3D,
      pitch,
      quaternion: new Quaternion(),
    })),
    hips,
    hipsParent: hips.parent,
    hipsPosition: new Vector3(),
    localOrigin: new Vector3(),
    localTarget: new Vector3(),
    poseApplied: false,
    supportProbes,
    worldOrigin: new Vector3(),
    worldProbe: new Vector3(),
    worldTarget: new Vector3(),
  }
}

export function resetLandrushRobotCrouchPose(rig: LandrushRobotCrouchRig | null) {
  if (!rig?.poseApplied) return
  rig.hips.position.copy(rig.hipsPosition)
  for (const state of rig.boneStates) state.bone.quaternion.copy(state.quaternion)
  rig.poseApplied = false
}

export function applyLandrushRobotCrouchPose(rig: LandrushRobotCrouchRig | null, amount: number) {
  if (!rig || amount <= 0.0001) return
  const clampedAmount = Math.max(0, Math.min(1, amount))
  rig.hipsPosition.copy(rig.hips.position)
  for (const state of rig.boneStates) state.quaternion.copy(state.bone.quaternion)
  rig.poseApplied = true
  updateLandrushRobotCrouchSupportMatrices(rig)
  const supportY = sampleLandrushRobotCrouchSupportY(rig)

  for (const state of rig.boneStates) {
    state.bone.rotateX(state.pitch * clampedAmount)
  }

  updateLandrushRobotCrouchSupportMatrices(rig)
  const correctionY =
    supportY -
    sampleLandrushRobotCrouchSupportY(rig) +
    LANDRUSH_ROBOT_CROUCH_SOLE_BIAS_METERS * clampedAmount
  rig.hipsParent.getWorldPosition(rig.worldOrigin)
  rig.worldTarget.copy(rig.worldOrigin)
  rig.worldTarget.y += correctionY
  rig.localOrigin.copy(rig.worldOrigin)
  rig.localTarget.copy(rig.worldTarget)
  rig.hipsParent.worldToLocal(rig.localOrigin)
  rig.hipsParent.worldToLocal(rig.localTarget)
  rig.hips.position.add(rig.localTarget.sub(rig.localOrigin))
}

function updateLandrushRobotCrouchSupportMatrices(rig: LandrushRobotCrouchRig) {
  for (const probe of rig.supportProbes) probe.bone.updateWorldMatrix(true, false)
}

function sampleLandrushRobotCrouchSupportY(rig: LandrushRobotCrouchRig) {
  let minimumY = Number.POSITIVE_INFINITY
  for (const probe of rig.supportProbes) {
    rig.worldProbe.copy(probe.point).applyMatrix4(probe.bone.matrixWorld)
    minimumY = Math.min(minimumY, rig.worldProbe.y)
  }
  return minimumY
}
