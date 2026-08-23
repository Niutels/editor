import { describe, expect, test } from 'bun:test'
import { Group, type Object3D } from 'three'
import {
  restoreLandrushZombieEscapeStructureRoots,
  syncLandrushZombieEscapeStructureRoots,
} from './landrush-zombie-escape-structure-presentation'

describe('Landrush Zombie Escape structure presentation', () => {
  test('hides only destroyed roots and restores their prior visibility', () => {
    const first = new Group()
    const second = new Group()
    const alreadyHidden = new Group()
    alreadyHidden.visible = false
    const hiddenRoots = new Map<Object3D, boolean>()

    syncLandrushZombieEscapeStructureRoots(new Set([first, alreadyHidden]), hiddenRoots)

    expect(first.visible).toBe(false)
    expect(second.visible).toBe(true)
    expect(alreadyHidden.visible).toBe(false)
    expect(hiddenRoots.get(first)).toBe(true)
    expect(hiddenRoots.get(alreadyHidden)).toBe(false)

    syncLandrushZombieEscapeStructureRoots(new Set([second]), hiddenRoots)

    expect(first.visible).toBe(true)
    expect(second.visible).toBe(false)
    expect(alreadyHidden.visible).toBe(false)
    expect(hiddenRoots.has(first)).toBe(false)
    expect(hiddenRoots.has(alreadyHidden)).toBe(false)

    restoreLandrushZombieEscapeStructureRoots(hiddenRoots)

    expect(second.visible).toBe(true)
    expect(hiddenRoots.size).toBe(0)
  })

  test('does not overwrite the captured state while a root remains destroyed', () => {
    const root = new Group()
    const hiddenRoots = new Map<Object3D, boolean>()
    const destroyedRoots = new Set<Object3D>([root])

    syncLandrushZombieEscapeStructureRoots(destroyedRoots, hiddenRoots)
    syncLandrushZombieEscapeStructureRoots(destroyedRoots, hiddenRoots)
    restoreLandrushZombieEscapeStructureRoots(hiddenRoots)

    expect(root.visible).toBe(true)
  })
})
