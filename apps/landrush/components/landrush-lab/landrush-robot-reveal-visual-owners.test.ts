import { describe, expect, test } from 'bun:test'
import { Group, Scene } from 'three'
import { collectLandrushRobotRevealVisualOwners } from './landrush-robot-reveal-visual-owners'
import {
  collectLandrushRobotRevealVisualRoots,
  registerLandrushRobotRevealVisualRoot,
} from './landrush-robot-reveal-visual-registry'

describe('Landrush robot reveal visual owners', () => {
  test('preserves traversal order even when registration order is reversed', () => {
    const scene = new Scene()
    const first = new Group()
    const second = new Group()
    const third = new Group()
    scene.add(first, second, third)
    registerLandrushRobotRevealVisualRoot(scene, third)
    registerLandrushRobotRevealVisualRoot(scene, second)
    registerLandrushRobotRevealVisualRoot(scene, first)

    const owners = collectLandrushRobotRevealVisualOwners({
      excludedRoots: new Set(),
      roots: collectLandrushRobotRevealVisualRoots(scene),
      semanticRoots: new Set(),
    })
    expect(owners.map((owner) => owner.object)).toEqual([first, second, third])
  })

  test('keeps the later scene object for a duplicate explicit id without moving its slot', () => {
    const first = new Group()
    const duplicate = new Group()
    const final = new Group()
    first.userData.landrushRobotRevealOwnerId = 'shared'
    duplicate.userData.landrushRobotRevealOwnerId = 'shared'
    final.userData.landrushRobotRevealOwnerId = 'final'

    const owners = collectLandrushRobotRevealVisualOwners({
      excludedRoots: new Set(),
      roots: [first, duplicate, final],
      semanticRoots: new Set(),
    })
    expect(owners.map((owner) => owner.ownerId)).toEqual(['visual:shared', 'visual:final'])
    expect(owners[0]?.object).toBe(duplicate)
  })

  test('uses UUID fallback and exact true precise classification', () => {
    const staticRoot = new Group()
    const preciseRoot = new Group()
    const truthyRoot = new Group()
    preciseRoot.userData.landrushRobotOccluderPrecise = true
    truthyRoot.userData.landrushRobotOccluderPrecise = 1

    const owners = collectLandrushRobotRevealVisualOwners({
      excludedRoots: new Set(),
      roots: [staticRoot, preciseRoot, truthyRoot],
      semanticRoots: new Set(),
    })
    expect(owners.map((owner) => owner.ownerId)).toEqual([
      `visual:${staticRoot.uuid}`,
      `visual:${preciseRoot.uuid}`,
      `visual:${truthyRoot.uuid}`,
    ])
    expect(owners.map((owner) => owner.dynamicBounds)).toEqual([false, true, false])
  })

  test('preserves semantic and excluded ancestry filtering', () => {
    const excluded = new Group()
    const excludedChild = new Group()
    const semantic = new Group()
    const semanticChild = new Group()
    const included = new Group()
    excluded.add(excludedChild)
    semantic.add(semanticChild)

    const owners = collectLandrushRobotRevealVisualOwners({
      excludedRoots: new Set([excluded]),
      roots: [excludedChild, semanticChild, included],
      semanticRoots: new Set([semantic]),
    })
    expect(owners.map((owner) => owner.object)).toEqual([included])
  })
})
