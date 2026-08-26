import { AnimationClip, Euler, type Group, Quaternion, QuaternionKeyframeTrack } from 'three'
import { ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import { ZOMBIE_ESCAPE_ZOMBIE_INTENT } from './zombie-escape-simulation'

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

const ATTACK_BONE_POSES: readonly AttackBonePose[] = [
  {
    name: 'Spine',
    rotations: createEulerSequence(
      [0.08, 0, 0],
      [-0.1, 0.16, 0],
      [-0.2, -0.1, 0],
      [0.12, 0.04, 0],
      [0.08, 0, 0],
    ),
  },
  {
    name: 'Spine01',
    rotations: createEulerSequence(
      [0.1, 0, 0],
      [-0.12, 0.2, 0],
      [-0.24, -0.12, 0],
      [0.16, 0.05, 0],
      [0.1, 0, 0],
    ),
  },
  {
    name: 'LeftArm',
    rotations: createEulerSequence(
      [-0.2, 0.48, 0.18],
      [0.18, -0.28, -0.38],
      [-0.32, 0.72, 0.22],
      [-0.14, 0.55, 0.12],
      [-0.2, 0.48, 0.18],
    ),
  },
  {
    name: 'LeftForeArm',
    rotations: createEulerSequence(
      [-0.12, 0, -0.42],
      [-0.48, 0, -0.72],
      [0.08, 0, -0.08],
      [-0.05, 0, -0.22],
      [-0.12, 0, -0.42],
    ),
  },
  {
    name: 'RightArm',
    rotations: createEulerSequence(
      [-0.22, -0.5, -0.18],
      [0.2, 0.3, 0.4],
      [-0.36, -0.76, -0.2],
      [-0.16, -0.58, -0.1],
      [-0.22, -0.5, -0.18],
    ),
  },
  {
    name: 'RightForeArm',
    rotations: createEulerSequence(
      [-0.14, 0, 0.44],
      [-0.52, 0, 0.75],
      [0.1, 0, 0.08],
      [-0.06, 0, 0.24],
      [-0.14, 0, 0.44],
    ),
  },
]

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

export function createZombieEscapeAttackClip(source: Group) {
  const times = ATTACK_KEYFRAME_PHASES.map(
    (phase) => phase * ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS,
  )
  const tracks = ATTACK_BONE_POSES.flatMap(({ name, rotations }) => {
    const bone = source.getObjectByName(name)
    if (!bone) return []
    const values: number[] = []
    let previous = bone.quaternion.clone()
    for (const rotation of rotations) {
      const offset = new Quaternion().setFromEuler(rotation)
      const pose = offset.multiply(bone.quaternion)
      if (previous.dot(pose) < 0) pose.set(-pose.x, -pose.y, -pose.z, -pose.w)
      pose.toArray(values, values.length)
      previous = pose
    }
    return [new QuaternionKeyframeTrack(`${name}.quaternion`, times, values)]
  })
  if (tracks.length === 0) return null
  return new AnimationClip(
    'zombie-escape-authored-obstacle-strike',
    ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS,
    tracks,
  )
}

function createEulerSequence(...rotations: readonly [number, number, number][]) {
  return rotations.map(([x, y, z]) => new Euler(x, y, z, 'XYZ'))
}
