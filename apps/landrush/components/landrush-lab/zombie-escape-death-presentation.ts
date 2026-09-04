import { ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS } from '@landrush/zombie-gameplay/zombie-escape-character-motion'
import { AnimationClip, Euler, type Group, Quaternion, QuaternionKeyframeTrack } from 'three'

const DEATH_KEYFRAME_PHASES = [0, 0.18, 0.46, 0.76, 1] as const

type DeathBonePose = Readonly<{
  name: string
  rotations: readonly Euler[]
}>

const DEATH_BONE_POSES: readonly DeathBonePose[] = [
  {
    name: 'Hips',
    rotations: createEulerSequence(
      [0.04, 0, 0.03],
      [0.12, 0.05, 0.12],
      [0.28, 0.1, 0.24],
      [0.2, 0.16, 0.32],
      [0.16, 0.18, 0.34],
    ),
  },
  {
    name: 'Spine',
    rotations: createEulerSequence(
      [0.1, 0, -0.04],
      [0.24, -0.08, -0.14],
      [0.42, -0.12, -0.28],
      [0.22, 0.12, -0.38],
      [0.16, 0.16, -0.4],
    ),
  },
  {
    name: 'Spine01',
    rotations: createEulerSequence(
      [0.08, 0, 0.04],
      [0.22, 0.1, 0.12],
      [0.36, 0.16, 0.26],
      [0.16, -0.1, 0.34],
      [0.12, -0.14, 0.36],
    ),
  },
  {
    name: 'Head',
    rotations: createEulerSequence(
      [0.06, 0, 0],
      [0.16, -0.08, 0.08],
      [-0.18, 0.12, -0.16],
      [0.24, -0.18, 0.24],
      [0.28, -0.2, 0.26],
    ),
  },
  {
    name: 'LeftArm',
    rotations: createEulerSequence(
      [-0.34, 0.38, 0.28],
      [-0.52, 0.18, 0.56],
      [-0.2, -0.18, 0.92],
      [0.88, 0.08, 0.64],
      [1.14, 0.1, 0.56],
    ),
  },
  {
    name: 'LeftForeArm',
    rotations: createEulerSequence(
      [-0.22, 0, -0.5],
      [-0.48, 0.08, -0.82],
      [-0.72, -0.12, -1.02],
      [0.1, 0.05, -0.78],
      [0.22, -0.01, -0.66],
    ),
  },
  {
    name: 'RightArm',
    rotations: createEulerSequence(
      [-0.38, -0.4, -0.24],
      [-0.6, -0.2, -0.52],
      [-0.28, 0.2, -0.86],
      [0.72, -0.08, 0.62],
      [0.93, -0.14, 1.02],
    ),
  },
  {
    name: 'RightForeArm',
    rotations: createEulerSequence(
      [-0.24, 0, 0.52],
      [-0.52, -0.08, 0.86],
      [-0.76, 0.12, 1.06],
      [-0.4, 0.28, 0.32],
      [-0.26, 0.38, 0.05],
    ),
  },
  {
    name: 'LeftUpLeg',
    rotations: createEulerSequence(
      [-0.1, 0, 0.04],
      [-0.4, 0.04, 0.14],
      [-0.62, 0.08, 0.24],
      [-0.3, 0.1, 0.2],
      [-0.14, 0.08, 0.16],
    ),
  },
  {
    name: 'LeftLeg',
    rotations: createEulerSequence(
      [0.16, 0, 0],
      [0.58, 0, -0.06],
      [0.86, 0.04, -0.1],
      [0.42, 0.06, -0.08],
      [0.2, 0.04, -0.04],
    ),
  },
  {
    name: 'RightUpLeg',
    rotations: createEulerSequence(
      [-0.08, 0, -0.04],
      [-0.32, -0.04, -0.14],
      [-0.54, -0.08, -0.24],
      [-0.26, -0.1, -0.2],
      [-0.12, -0.08, -0.16],
    ),
  },
  {
    name: 'RightLeg',
    rotations: createEulerSequence(
      [0.12, 0, 0],
      [0.5, 0, 0.06],
      [0.76, -0.04, 0.1],
      [0.36, -0.06, 0.08],
      [0.18, -0.04, 0.04],
    ),
  },
]

export function createZombieEscapeDeathClip(source: Group) {
  const times = DEATH_KEYFRAME_PHASES.map(
    (phase) => phase * ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS,
  )
  const tracks = DEATH_BONE_POSES.flatMap(({ name, rotations }) => {
    const bone = source.getObjectByName(name)
    if (!bone) return []
    const values: number[] = []
    let previous = bone.quaternion.clone()
    for (const rotation of rotations) {
      const pose = new Quaternion().setFromEuler(rotation).multiply(bone.quaternion)
      if (previous.dot(pose) < 0) pose.set(-pose.x, -pose.y, -pose.z, -pose.w)
      pose.toArray(values, values.length)
      previous = pose
    }
    return [new QuaternionKeyframeTrack(`${name}.quaternion`, times, values)]
  })
  if (tracks.length === 0) return null
  return new AnimationClip(
    'zombie-escape-authored-joint-collapse',
    ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS,
    tracks,
  )
}

function createEulerSequence(...rotations: readonly [number, number, number][]) {
  return rotations.map(([x, y, z]) => new Euler(x, y, z, 'XYZ'))
}
