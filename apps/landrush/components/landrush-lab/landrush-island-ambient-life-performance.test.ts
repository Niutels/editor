import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  AnimationClip,
  AnimationMixer,
  BufferGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
} from 'three'
import {
  applyAuthorityAmbientNpcPose,
  resolveLandrushIslandFishUpdateRange,
  setLandrushIslandFishInstanceMatrixIfChanged,
  shouldAdvanceLandrushIslandFishBatches,
} from './landrush-island-ambient-life'

describe('Landrush island ambient-life frame work', () => {
  test('renders the server pose and radians clip phase without extrapolating missing snapshots', () => {
    const root = new Group()
    const mixer = new AnimationMixer(root)
    const idle = mixer.clipAction(new AnimationClip('idle', 2, [])).play()
    const walk = mixer.clipAction(new AnimationClip('walk', 4, [])).play()
    const run = mixer.clipAction(new AnimationClip('run', 1, [])).play()
    const actions = { attack: null, death: null, idle, walk, run, mixer }
    const pose = {
      index: 0,
      x: 12,
      y: 0.5,
      z: -8,
      yaw: 1,
      phase: 'walk' as const,
      locomotionPhase: Math.PI,
    }
    expect(applyAuthorityAmbientNpcPose(root, actions, pose)).toBe(true)
    expect(root.position.toArray()).toEqual([12, 0.5, -8])
    expect(root.rotation.y).toBe(1)
    expect(walk.time).toBe(2)
    expect(walk.getEffectiveWeight()).toBe(1)
    expect(idle.getEffectiveWeight()).toBe(0)
    expect(run.getEffectiveWeight()).toBe(0)
    expect(applyAuthorityAmbientNpcPose(root, actions, null)).toBe(false)
    expect(root.position.toArray()).toEqual([12, 0.5, -8])
    expect(walk.time).toBe(2)
    mixer.stopAllAction()
    mixer.uncacheRoot(root)
  })

  test('server-owned daytime presentation returns before local planning and motion', () => {
    const source = readFileSync(
      new URL('./landrush-island-ambient-life.tsx', import.meta.url),
      'utf8',
    )
    expect(source).toMatch(
      /if \(ambientNpcPresentationRegistry\.readRuntime\(\)\?\.readAuthorityAmbientNpc\) return\s+const result = npcJourneyPlanner\.advance/,
    )
    expect(source).toMatch(
      /if \(!readAuthorityAmbientNpc && motionWorldRef\.current !== navigationWorld\)/,
    )
    const frame = source.slice(source.indexOf('if (!dayActive) return'), source.indexOf('}, -5)'))
    expect(frame).toMatch(
      /if \(readAuthorityAmbientNpc\) \{[\s\S]*?applyAuthorityAmbientNpcPose[\s\S]*?return\s+\}[\s\S]*?advanceLandrushIslandAmbientNpcMotion/,
    )
  })

  test('authority NPC claims can recover after disappearance and retain pending visible poses', () => {
    const source = readFileSync(
      new URL('./landrush-island-ambient-life.tsx', import.meta.url),
      'utf8',
    )
    const frame = source.slice(
      source.indexOf('if (dayActive || !zombieIslandActive'),
      source.indexOf('}, AMBIENT_NPC_ZOMBIE_PRESENTATION_FRAME_PRIORITY)'),
    )
    expect(frame).toContain('if (presentation.releasedForNight && !readAuthorityAmbientNpc) return')
    expect(frame).toMatch(
      /if \(pending && readAuthorityAmbientNpc\) \{[\s\S]*?applyAuthorityAmbientNpcPose[\s\S]*?presentation\.releasedForNight = false/,
    )
    expect(frame).toMatch(
      /if \(presentation.activeSlot < 0\) \{\s+presentation\.releasedForNight = false/,
    )
  })

  test('pauses underwater fish animation while Zombie gameplay owns the frame budget', () => {
    expect(shouldAdvanceLandrushIslandFishBatches(true, false)).toBe(true)
    expect(shouldAdvanceLandrushIslandFishBatches(true, true)).toBe(false)
    expect(shouldAdvanceLandrushIslandFishBatches(false, false)).toBe(false)
    expect(shouldAdvanceLandrushIslandFishBatches(false, true)).toBe(false)
  })

  test('partitions phased fish updates into contiguous upload ranges', () => {
    expect(resolveLandrushIslandFishUpdateRange(5, 0, 2)).toEqual({ count: 2, start: 0 })
    expect(resolveLandrushIslandFishUpdateRange(5, 1, 2)).toEqual({ count: 3, start: 2 })
    expect(resolveLandrushIslandFishUpdateRange(6, 2, 3)).toEqual({ count: 2, start: 4 })
    expect(resolveLandrushIslandFishUpdateRange(0, 0, 2)).toEqual({ count: 0, start: 0 })
  })

  test('does not rewrite an unchanged fish instance matrix', () => {
    const geometry = new BufferGeometry()
    const material = new MeshBasicMaterial()
    const mesh = new InstancedMesh(geometry, material, 2)
    const identity = new Matrix4()
    const moved = new Matrix4().makeTranslation(3, 1, -2)

    try {
      expect(setLandrushIslandFishInstanceMatrixIfChanged(mesh, 1, identity)).toBe(false)
      expect(setLandrushIslandFishInstanceMatrixIfChanged(mesh, 1, moved)).toBe(true)
      expect(setLandrushIslandFishInstanceMatrixIfChanged(mesh, 1, moved)).toBe(false)
    } finally {
      mesh.dispose()
      geometry.dispose()
      material.dispose()
    }
  })
})
