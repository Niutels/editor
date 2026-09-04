import {
  createZombieEscapeAttackSwingPose,
  resolveZombieEscapeAttackSwingPose,
  type ZombieEscapeAttackDirection,
} from '@landrush/zombie-gameplay/zombie-escape-character-motion'
import { ZOMBIE_ESCAPE_SIMULATION } from '@landrush/zombie-gameplay/zombie-escape-config'
import { ZOMBIE_ESCAPE_ZOMBIE_INTENT } from '@landrush/zombie-gameplay/zombie-escape-simulation'
import {
  AnimationClip,
  Euler,
  type Group,
  PropertyBinding,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
} from 'three'

export const ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS =
  ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds

const ATTACK_KEYFRAME_PHASES = [
  0,
  0.18,
  ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackContactPhase,
  0.72,
  1,
] as const

type AttackBonePose = Readonly<{
  name: string
  rotations: readonly Euler[]
}>

const ATTACK_TORSO_BONE_POSES: readonly AttackBonePose[] = [
  {
    name: 'Spine',
    rotations: createEulerSequence(
      [0.06, 0, 0],
      [-0.1, 0.12, -0.04],
      [0.2, -0.1, 0.04],
      [0.14, -0.04, 0.02],
      [0.06, 0, 0],
    ),
  },
  {
    name: 'Spine01',
    rotations: createEulerSequence(
      [0.08, 0, 0],
      [-0.12, 0.16, -0.04],
      [0.26, -0.12, 0.05],
      [0.18, -0.05, 0.02],
      [0.08, 0, 0],
    ),
  },
]

const BONE_FORWARD_AXIS = new Vector3(0, 1, 0)
const ATTACK_LOCOMOTION_BONE_NAMES = new Set([
  'Hips',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'LeftToeBase',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
  'RightToeBase',
])

export function isZombieEscapeAttackPresentationActive(intent: number) {
  return (
    intent === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle ||
    intent === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackPlayer
  )
}

export function resolveZombieEscapeAttackNormalizedPhase(attackCooldown: number) {
  const remaining = Number.isFinite(attackCooldown)
    ? Math.min(ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS, Math.max(0, attackCooldown))
    : ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS
  return 1 - remaining / ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS
}

export function createZombieEscapeAttackClip(source: Group, walkClip: AnimationClip | null = null) {
  const times = ATTACK_KEYFRAME_PHASES.map(
    (phase) => phase * ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS,
  )
  source.updateWorldMatrix(true, true)
  const tracks = createAttackLocomotionTracks(source, walkClip).concat(
    ATTACK_TORSO_BONE_POSES.flatMap(({ name, rotations }) => {
      const bone = source.getObjectByName(name)
      if (!bone) return []
      const values: number[] = []
      let previous = bone.quaternion.clone()
      for (const rotation of rotations) {
        const pose = new Quaternion().setFromEuler(rotation).multiply(bone.quaternion)
        appendContinuousQuaternion(values, pose, previous)
        previous = pose
      }
      return [new QuaternionKeyframeTrack(`${name}.quaternion`, times, values)]
    }),
    createAttackArmTracks(source, times, 'left'),
    createAttackArmTracks(source, times, 'right'),
  )
  if (tracks.length === 0) return null
  return new AnimationClip(
    'zombie-escape-authored-obstacle-strike',
    ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS,
    tracks,
  )
}

function createAttackLocomotionTracks(source: Group, walkClip: AnimationClip | null) {
  if (!(walkClip && Number.isFinite(walkClip.duration) && walkClip.duration > 0)) return []
  const timeScale = ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS / walkClip.duration
  return walkClip.tracks.flatMap((track) => {
    const nodeName = PropertyBinding.parseTrackName(track.name).nodeName
    if (
      !nodeName ||
      !ATTACK_LOCOMOTION_BONE_NAMES.has(nodeName) ||
      !source.getObjectByName(nodeName)
    ) {
      return []
    }
    const locomotionTrack = track.clone()
    locomotionTrack.scale(timeScale)
    return [locomotionTrack]
  })
}

function createEulerSequence(...rotations: readonly [number, number, number][]) {
  return rotations.map(([x, y, z]) => new Euler(x, y, z, 'XYZ'))
}

function createAttackArmTracks(source: Group, times: readonly number[], side: 'left' | 'right') {
  const prefix = side === 'left' ? 'Left' : 'Right'
  const upperArm = source.getObjectByName(`${prefix}Arm`)
  const forearm = source.getObjectByName(`${prefix}ForeArm`)
  if (!(upperArm?.parent && forearm?.parent === upperArm)) return []

  const sourceWorldQuaternion = source.getWorldQuaternion(new Quaternion())
  const upperArmParentWorldQuaternion = upperArm.parent.getWorldQuaternion(new Quaternion())
  const swingPose = createZombieEscapeAttackSwingPose()
  const upperArmValues: number[] = []
  const forearmValues: number[] = []
  let previousUpperArmQuaternion = upperArm.quaternion.clone()
  let previousForearmQuaternion = forearm.quaternion.clone()

  for (const phase of ATTACK_KEYFRAME_PHASES) {
    resolveZombieEscapeAttackSwingPose(phase, swingPose)
    const upperArmDirection = resolveAttackDirection(swingPose, side, false)
      .applyQuaternion(sourceWorldQuaternion)
      .normalize()
    const upperArmQuaternion = aimBoneAtDirection(
      upperArm.quaternion,
      upperArmParentWorldQuaternion,
      upperArmDirection,
    )
    appendContinuousQuaternion(upperArmValues, upperArmQuaternion, previousUpperArmQuaternion)
    previousUpperArmQuaternion = upperArmQuaternion

    const posedUpperArmWorldQuaternion = upperArmParentWorldQuaternion
      .clone()
      .multiply(upperArmQuaternion)
    const forearmDirection = resolveAttackDirection(swingPose, side, true)
      .applyQuaternion(sourceWorldQuaternion)
      .normalize()
    const forearmQuaternion = aimBoneAtDirection(
      forearm.quaternion,
      posedUpperArmWorldQuaternion,
      forearmDirection,
    )
    appendContinuousQuaternion(forearmValues, forearmQuaternion, previousForearmQuaternion)
    previousForearmQuaternion = forearmQuaternion
  }

  return [
    new QuaternionKeyframeTrack(`${prefix}Arm.quaternion`, times, upperArmValues),
    new QuaternionKeyframeTrack(`${prefix}ForeArm.quaternion`, times, forearmValues),
  ]
}

function resolveAttackDirection(
  pose: ReturnType<typeof createZombieEscapeAttackSwingPose>,
  side: 'left' | 'right',
  forearm: boolean,
) {
  const direction: ZombieEscapeAttackDirection = forearm
    ? side === 'left'
      ? pose.leftForearmDirection
      : pose.rightForearmDirection
    : side === 'left'
      ? pose.leftUpperArmDirection
      : pose.rightUpperArmDirection
  return new Vector3(direction.x, direction.y, direction.z)
}

function aimBoneAtDirection(
  bindQuaternion: Quaternion,
  parentWorldQuaternion: Quaternion,
  desiredWorldDirection: Vector3,
) {
  const bindDirection = BONE_FORWARD_AXIS.clone().applyQuaternion(bindQuaternion).normalize()
  const desiredParentDirection = desiredWorldDirection
    .clone()
    .applyQuaternion(parentWorldQuaternion.clone().invert())
    .normalize()
  return new Quaternion()
    .setFromUnitVectors(bindDirection, desiredParentDirection)
    .multiply(bindQuaternion)
}

function appendContinuousQuaternion(
  values: number[],
  quaternion: Quaternion,
  previous: Quaternion,
) {
  if (previous.dot(quaternion) < 0) {
    quaternion.set(-quaternion.x, -quaternion.y, -quaternion.z, -quaternion.w)
  }
  quaternion.toArray(values, values.length)
}
