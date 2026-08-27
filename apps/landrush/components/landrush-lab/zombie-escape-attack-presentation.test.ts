import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  AnimationClip,
  Bone,
  Group,
  Object3D,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from 'three'
import {
  createZombieEscapeAttackClip,
  isZombieEscapeAttackPresentationActive,
  resolveZombieEscapeAttackNormalizedPhase,
  ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS,
} from './zombie-escape-attack-presentation'
import { ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import { ZOMBIE_ESCAPE_ZOMBIE_INTENT } from './zombie-escape-simulation'
import { ZOMBIE_ESCAPE_ZOMBIE_CATALOG } from './zombie-escape-zombie-catalog'

const AUTHORED_MOTION_BONES = [
  'Hips',
  'Spine',
  'Spine01',
  'Head',
  'LeftArm',
  'LeftForeArm',
  'RightArm',
  'RightForeArm',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'LeftToeBase',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
  'RightToeBase',
] as const

describe('zombie obstacle-attack presentation', () => {
  test('maps semantic attack intent onto the authoritative attack cooldown', () => {
    expect(isZombieEscapeAttackPresentationActive(ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase)).toBe(false)
    expect(isZombieEscapeAttackPresentationActive(ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle)).toBe(
      true,
    )
    expect(isZombieEscapeAttackPresentationActive(ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackPlayer)).toBe(
      true,
    )
    expect(
      resolveZombieEscapeAttackNormalizedPhase(ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS),
    ).toBe(0)
    expect(
      resolveZombieEscapeAttackNormalizedPhase(
        ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS * 0.5,
      ),
    ).toBeCloseTo(0.5, 6)
    expect(
      resolveZombieEscapeAttackNormalizedPhase(
        ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS *
          (1 - ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackContactPhase),
      ),
    ).toBeCloseTo(ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackContactPhase, 6)
    expect(resolveZombieEscapeAttackNormalizedPhase(0)).toBe(1)
  })

  test('authors a looping full upper-body strike from the compatible rig bind pose', () => {
    const source = createAttackRig()
    const clip = createZombieEscapeAttackClip(source)

    expect(clip).not.toBeNull()
    expect(clip?.duration).toBe(ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS)
    expect(clip?.tracks.map((track) => track.name)).toEqual([
      'Spine.quaternion',
      'Spine01.quaternion',
      'LeftArm.quaternion',
      'LeftForeArm.quaternion',
      'RightArm.quaternion',
      'RightForeArm.quaternion',
    ])
    for (const track of clip?.tracks ?? []) {
      expect(track.times[0]).toBe(0)
      expect(track.times[2]).toBeCloseTo(
        ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS *
          ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackContactPhase,
        6,
      )
      expect(track.times.at(-1)).toBeCloseTo(ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS, 6)
      expect(Array.from(track.values.slice(0, 4))).toEqual(Array.from(track.values.slice(-4)))
      if (track.name.startsWith('Left')) {
        expect(Array.from(track.values.slice(4, 8))).toEqual(Array.from(track.values.slice(0, 4)))
      } else {
        expect(Array.from(track.values.slice(4, 8))).not.toEqual(
          Array.from(track.values.slice(0, 4)),
        )
      }
    }
  })

  test('retimes one walk loop onto only the hips and lower body of the strike', () => {
    const source = createAttackRig()
    const hipsTrack = new VectorKeyframeTrack(
      'Hips.position',
      [0, 0.6, 1.2],
      [0, 1, 0, 0, 0.92, 0.08, 0, 1, 0],
    )
    const leftLegTrack = new QuaternionKeyframeTrack(
      'LeftUpLeg.quaternion',
      [0, 0.6, 1.2],
      [0, 0, 0, 1, 0.28, 0, 0, 0.96, 0, 0, 0, 1],
    )
    const upperBodyWalkTrack = new QuaternionKeyframeTrack(
      'Spine.quaternion',
      [0, 0.6, 1.2],
      [0, 0, 0, 1, 0.2, 0, 0, 0.98, 0, 0, 0, 1],
    )
    const walkClip = new AnimationClip('runtime-walk', 1.2, [
      hipsTrack,
      leftLegTrack,
      upperBodyWalkTrack,
    ])
    const originalHipsTimes = Array.from(hipsTrack.times)
    const originalLeftLegTimes = Array.from(leftLegTrack.times)

    const clip = createZombieEscapeAttackClip(source, walkClip)

    expect(clip?.name).toBe('zombie-escape-authored-obstacle-strike')
    expect(clip?.tracks.map((track) => track.name)).toEqual([
      'Hips.position',
      'LeftUpLeg.quaternion',
      'Spine.quaternion',
      'Spine01.quaternion',
      'LeftArm.quaternion',
      'LeftForeArm.quaternion',
      'RightArm.quaternion',
      'RightForeArm.quaternion',
    ])
    for (const track of clip?.tracks.slice(0, 2) ?? []) {
      expect(track.times[0]).toBe(0)
      expect(track.times[1]).toBeCloseTo(ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS * 0.5, 6)
      expect(track.times[2]).toBeCloseTo(ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS, 6)
    }
    expect(Array.from(hipsTrack.times)).toEqual(originalHipsTimes)
    expect(Array.from(leftLegTrack.times)).toEqual(originalLeftLegTimes)
    expect(clip?.tracks.filter((track) => track.name === 'Spine.quaternion')).toHaveLength(1)
    expect(Array.from(clip?.tracks[0]?.values.slice(0, 3) ?? [])).toEqual(
      Array.from(clip?.tracks[0]?.values.slice(-3) ?? []),
    )
    expect(Array.from(clip?.tracks[1]?.values.slice(0, 4) ?? [])).toEqual(
      Array.from(clip?.tracks[1]?.values.slice(-4) ?? []),
    )
  })

  test('covers the exact authored joint names in every runtime zombie GLB', () => {
    for (const zombie of ZOMBIE_ESCAPE_ZOMBIE_CATALOG) {
      const nodeNames = new Set(
        readGlbJson(zombie.glb.riggedBase.path).nodes?.flatMap(({ name }) =>
          name ? [name] : [],
        ) ?? [],
      )
      expect({
        id: zombie.id,
        missing: AUTHORED_MOTION_BONES.filter((name) => !nodeNames.has(name)),
      }).toEqual({ id: zombie.id, missing: [] })
    }
  })

  test('drives every runtime rig through one tucked overhand strike instead of an armature-space wobble', () => {
    for (const zombie of ZOMBIE_ESCAPE_ZOMBIE_CATALOG) {
      const source = createRuntimeAttackRig(zombie.glb.riggedBase.path)
      const clip = createZombieEscapeAttackClip(source)
      expect(clip).not.toBeNull()
      if (!clip) continue

      const guard = sampleAttackKeyframe(source, clip, 0)
      const windup = sampleAttackKeyframe(source, clip, 1)
      const contact = sampleAttackKeyframe(source, clip, 2)
      const followThrough = sampleAttackKeyframe(source, clip, 3)

      expect(windup.rightHand.y - contact.rightHand.y).toBeGreaterThan(0.65)
      expect(contact.rightHand.z - windup.rightHand.z).toBeGreaterThan(0.5)
      expect(Math.abs(contact.rightHand.x)).toBeLessThan(0.18)
      expect(followThrough.rightHand.x - contact.rightHand.x).toBeGreaterThan(0.12)
      expect(Math.abs(guard.leftHand.x)).toBeLessThan(0.24)
      expect(guard.leftHand.z).toBeGreaterThan(0.2)
    }
  })

  test('returns no fake animation when a source has no compatible authored bones', () => {
    expect(createZombieEscapeAttackClip(new Group())).toBeNull()
  })
})

function createAttackRig() {
  const root = new Group()
  const hips = createBone('Hips')
  const spine01 = createBone('Spine01')
  const spine = createBone('Spine')
  const leftArm = createBone('LeftArm')
  const leftForearm = createBone('LeftForeArm')
  const rightArm = createBone('RightArm')
  const rightForearm = createBone('RightForeArm')
  const leftUpLeg = createBone('LeftUpLeg')
  const rightUpLeg = createBone('RightUpLeg')
  root.add(hips)
  hips.add(spine01, leftUpLeg, rightUpLeg)
  spine01.add(spine)
  spine.add(leftArm, rightArm)
  leftArm.add(leftForearm)
  rightArm.add(rightForearm)
  return root
}

function createBone(name: string) {
  const bone = new Bone()
  bone.name = name
  return bone
}

type RuntimeGlbNode = {
  children?: number[]
  matrix?: number[]
  name?: string
  rotation?: number[]
  scale?: number[]
  translation?: number[]
}

function readGlbJson(publicPath: string) {
  const bytes = readFileSync(
    resolve(import.meta.dir, '../../public', publicPath.replace(/^\//, '')),
  )
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let offset = 12; offset + 8 <= bytes.byteLength; ) {
    const chunkLength = view.getUint32(offset, true)
    const chunkType = view.getUint32(offset + 4, true)
    if (chunkType === 0x4e4f_534a) {
      const chunk = bytes.toString('utf8', offset + 8, offset + 8 + chunkLength)
      const paddingStart = chunk.indexOf(String.fromCharCode(0))
      return JSON.parse((paddingStart < 0 ? chunk : chunk.slice(0, paddingStart)).trimEnd()) as {
        nodes?: RuntimeGlbNode[]
      }
    }
    offset += 8 + chunkLength
  }
  throw new Error(`Missing JSON chunk in ${publicPath}`)
}

function createRuntimeAttackRig(publicPath: string) {
  const nodes = readGlbJson(publicPath).nodes ?? []
  const objects = nodes.map((node) => {
    const object = new Object3D()
    object.name = node.name ?? ''
    if (node.translation) object.position.fromArray(node.translation)
    if (node.rotation) object.quaternion.fromArray(node.rotation)
    if (node.scale) object.scale.fromArray(node.scale)
    if (node.matrix) {
      object.matrix.fromArray(node.matrix)
      object.matrix.decompose(object.position, object.quaternion, object.scale)
    }
    return object
  })
  const childIndices = new Set<number>()
  for (let index = 0; index < nodes.length; index += 1) {
    for (const childIndex of nodes[index]?.children ?? []) {
      objects[index]?.add(objects[childIndex]!)
      childIndices.add(childIndex)
    }
  }
  const root = new Group()
  for (let index = 0; index < objects.length; index += 1) {
    if (!childIndices.has(index)) root.add(objects[index]!)
  }
  root.updateMatrixWorld(true)
  return root
}

function sampleAttackKeyframe(
  source: Group,
  clip: NonNullable<ReturnType<typeof createZombieEscapeAttackClip>>,
  keyframeIndex: number,
) {
  for (const track of clip.tracks) {
    const bone = source.getObjectByName(track.name.replace(/\.quaternion$/, ''))
    bone?.quaternion.fromArray(track.values, keyframeIndex * 4)
  }
  source.updateMatrixWorld(true)
  return {
    leftHand: source.getObjectByName('LeftHand')!.getWorldPosition(new Vector3()),
    rightHand: source.getObjectByName('RightHand')!.getWorldPosition(new Vector3()),
  }
}
