import { describe, expect, test } from 'bun:test'
import { Bone, Group } from 'three'
import {
  createZombieEscapeAttackClip,
  isZombieEscapeAttackPresentationActive,
  resolveZombieEscapeAttackNormalizedPhase,
  ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS,
} from './zombie-escape-attack-presentation'
import { ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import { ZOMBIE_ESCAPE_ZOMBIE_INTENT } from './zombie-escape-simulation'

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
      expect(Array.from(track.values.slice(4, 8))).not.toEqual(Array.from(track.values.slice(0, 4)))
    }
  })

  test('returns no fake animation when a source has no compatible authored bones', () => {
    expect(createZombieEscapeAttackClip(new Group())).toBeNull()
  })
})

function createAttackRig() {
  const root = new Group()
  for (const name of ['Spine', 'Spine01', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm']) {
    const bone = new Bone()
    bone.name = name
    root.add(bone)
  }
  return root
}
