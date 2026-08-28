import { describe, expect, test } from 'bun:test'
import { Group, Scene } from 'three'
import {
  collectLandrushRobotRevealVisualRoots,
  registerLandrushRobotRevealVisualRoot,
} from './landrush-robot-reveal-visual-registry'

describe('Landrush robot reveal visual registry', () => {
  test('returns visual roots in scene traversal order, not registration order', () => {
    const scene = new Scene()
    const firstBranch = new Group()
    const secondBranch = new Group()
    const first = new Group()
    const nested = new Group()
    const second = new Group()
    firstBranch.add(first, nested)
    secondBranch.add(second)
    scene.add(firstBranch, secondBranch)

    registerLandrushRobotRevealVisualRoot(scene, second)
    registerLandrushRobotRevealVisualRoot(scene, nested)
    registerLandrushRobotRevealVisualRoot(scene, first)

    expect(collectLandrushRobotRevealVisualRoots(scene)).toEqual([first, nested, second])
  })

  test('is idempotent and reference-counted', () => {
    const scene = new Scene()
    const root = new Group()
    scene.add(root)
    const unregisterFirst = registerLandrushRobotRevealVisualRoot(scene, root)
    const unregisterSecond = registerLandrushRobotRevealVisualRoot(scene, root)

    expect(collectLandrushRobotRevealVisualRoots(scene)).toEqual([root])
    unregisterFirst()
    unregisterFirst()
    expect(collectLandrushRobotRevealVisualRoots(scene)).toEqual([root])
    unregisterSecond()
    expect(collectLandrushRobotRevealVisualRoots(scene)).toEqual([])
  })

  test('drops roots that left the exact scene without disturbing replacements', () => {
    const scene = new Scene()
    const otherScene = new Scene()
    const oldRoot = new Group()
    const replacement = new Group()
    scene.add(oldRoot, replacement)
    const unregisterOld = registerLandrushRobotRevealVisualRoot(scene, oldRoot)
    registerLandrushRobotRevealVisualRoot(scene, replacement)

    otherScene.add(oldRoot)
    expect(collectLandrushRobotRevealVisualRoots(scene)).toEqual([replacement])
    unregisterOld()
    expect(collectLandrushRobotRevealVisualRoots(scene)).toEqual([replacement])
  })

  test('keeps separate scene registries isolated', () => {
    const firstScene = new Scene()
    const secondScene = new Scene()
    const first = new Group()
    const second = new Group()
    firstScene.add(first)
    secondScene.add(second)
    registerLandrushRobotRevealVisualRoot(firstScene, first)
    registerLandrushRobotRevealVisualRoot(secondScene, second)

    expect(collectLandrushRobotRevealVisualRoots(firstScene)).toEqual([first])
    expect(collectLandrushRobotRevealVisualRoots(secondScene)).toEqual([second])
  })
})
