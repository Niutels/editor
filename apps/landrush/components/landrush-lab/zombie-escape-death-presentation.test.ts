import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS } from '@landrush/zombie-gameplay/zombie-escape-character-motion'
import {
  createZombieEscapePresentationPose,
  resolveZombieEscapePresentationPose,
} from '@landrush/zombie-gameplay/zombie-escape-presentation-pose'
import { ZOMBIE_ESCAPE_ZOMBIE_CATALOG } from '@landrush/zombie-gameplay/zombie-escape-zombie-catalog'
import { AnimationMixer, Bone, Group, LoopOnce, Matrix4, Quaternion, Vector3 } from 'three'
import { createZombieEscapeDeathClip } from './zombie-escape-death-presentation'

describe('Zombie Escape joint-collapse clip', () => {
  test('buckles the compatible rig into a non-looping terminal body pose', () => {
    const source = new Group()
    for (const name of [
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
      'RightUpLeg',
      'RightLeg',
    ]) {
      const bone = new Bone()
      bone.name = name
      source.add(bone)
    }

    const clip = createZombieEscapeDeathClip(source)
    expect(clip).not.toBeNull()
    expect(clip?.duration).toBe(ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS)
    expect(clip?.tracks).toHaveLength(12)
    for (const track of clip?.tracks ?? []) {
      expect(track.times[0]).toBe(0)
      expect(track.times.at(-1)).toBeCloseTo(ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS, 6)
      expect(Array.from(track.values.slice(-4))).not.toEqual(Array.from(track.values.slice(0, 4)))
    }
  })

  test('returns no placeholder clip when the rig has no compatible joints', () => {
    expect(createZombieEscapeDeathClip(new Group())).toBeNull()
  })

  test('does not leave either arm upright in the runtime dockworker terminal pose', () => {
    const zombie = ZOMBIE_ESCAPE_ZOMBIE_CATALOG[0]!
    const source = createRuntimeRig(zombie.glb.riggedBase.path)
    const clip = createZombieEscapeDeathClip(source)!
    const mixer = new AnimationMixer(source)
    const action = mixer.clipAction(clip)
    action.setLoop(LoopOnce, 1)
    action.clampWhenFinished = true
    action.play()
    mixer.setTime(clip.duration)
    source.updateMatrixWorld(true)

    const pose = createZombieEscapePresentationPose()
    resolveZombieEscapePresentationPose(
      0,
      0,
      0,
      0,
      0,
      0.78,
      0.16,
      -0.46,
      pose,
      zombie.characterHeightMeters * 0.5,
      1,
      0,
    )
    const fall = new Quaternion(
      pose.quaternionX,
      pose.quaternionY,
      pose.quaternionZ,
      pose.quaternionW,
    )
    for (const name of ['LeftForeArm', 'LeftHand', 'RightForeArm', 'RightHand']) {
      const bone = source.getObjectByName(name)
      expect(bone).toBeDefined()
      const terminalY = bone!.getWorldPosition(new Vector3()).applyQuaternion(fall).y
      expect(Math.abs(terminalY)).toBeLessThan(0.3)
    }
  })
})

function createRuntimeRig(publicPath: string) {
  const bytes = readFileSync(
    resolve(import.meta.dir, '../../public', publicPath.replace(/^\//, '')),
  )
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let json: {
    nodes: Array<{
      children?: number[]
      matrix?: number[]
      name?: string
      rotation?: [number, number, number, number]
      scale?: [number, number, number]
      translation?: [number, number, number]
    }>
    scene?: number
    scenes: Array<{ nodes?: number[] }>
  } | null = null
  for (let offset = 12; offset + 8 <= bytes.byteLength; ) {
    const chunkLength = view.getUint32(offset, true)
    const chunkType = view.getUint32(offset + 4, true)
    if (chunkType === 0x4e4f_534a) {
      json = JSON.parse(
        bytes.toString('utf8', offset + 8, offset + 8 + chunkLength).replace(/\0+$/, ''),
      )
      break
    }
    offset += 8 + chunkLength
  }
  if (!json) throw new Error(`Missing JSON chunk in ${publicPath}`)
  const bones = json.nodes.map((node) => {
    const bone = new Bone()
    bone.name = node.name ?? ''
    if (node.matrix) {
      new Matrix4().fromArray(node.matrix).decompose(bone.position, bone.quaternion, bone.scale)
    } else {
      if (node.translation) bone.position.fromArray(node.translation)
      if (node.rotation) bone.quaternion.fromArray(node.rotation)
      if (node.scale) bone.scale.fromArray(node.scale)
    }
    return bone
  })
  json.nodes.forEach((node, index) => {
    for (const childIndex of node.children ?? []) bones[index]!.add(bones[childIndex]!)
  })
  const root = new Group()
  for (const nodeIndex of json.scenes[json.scene ?? 0]?.nodes ?? []) root.add(bones[nodeIndex]!)
  return root
}
