import { describe, expect, test } from 'bun:test'
import type { LevelNode } from '@pascal-app/core'
import { Group, type Material, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three'
import { readLandrushIslandFloorFadeOpacity } from './landrush-floor-fade-opacity'
import {
  applyLandrushIslandFloorLevelOpacity,
  ensureLandrushIslandFloorFadeLevelPreparation,
  type LandrushIslandFloorFadeLevelState,
  type LandrushIslandFloorFadeMaterialState,
  prepareLandrushIslandFloorFadeLevels,
  restoreLandrushIslandFloorFadeLevels,
} from './landrush-floor-fade-presentation'

describe('Landrush floor fade presentation', () => {
  test('prepares, fades, and restores a rendered floor without leaking material state', () => {
    const levelId = 'level-test' as LevelNode['id']
    const root = new Group()
    const material = new MeshBasicMaterial()
    const mesh = new Mesh(new PlaneGeometry(2, 2), material)
    root.add(mesh)

    const floorFadeLevels = new Map<LevelNode['id'], LandrushIslandFloorFadeLevelState>()
    const floorFadeMaterials = new Map<Material, LandrushIslandFloorFadeMaterialState>()
    const preparationQueue: LevelNode['id'][] = []
    const queuedLevelIds = new Set<LevelNode['id']>()

    ensureLandrushIslandFloorFadeLevelPreparation({
      floorFadeLevels,
      floorFadeMaterials,
      levelId,
      preparationQueue,
      queuedLevelIds,
      root,
    })
    while (!floorFadeLevels.get(levelId)?.complete) {
      prepareLandrushIslandFloorFadeLevels({
        floorFadeLevels,
        floorFadeMaterials,
        preparationQueue,
        queuedLevelIds,
      })
    }

    applyLandrushIslandFloorLevelOpacity({
      floorFadeLevels,
      floorFadeMaterials,
      levelId,
      opacity: 0.5,
      root,
    })
    expect(root.visible).toBe(true)
    expect(readLandrushIslandFloorFadeOpacity(mesh)).toBe(0.5)
    expect(material.transparent).toBe(true)

    applyLandrushIslandFloorLevelOpacity({
      floorFadeLevels,
      floorFadeMaterials,
      levelId,
      opacity: 0,
      root,
    })
    expect(root.visible).toBe(false)

    restoreLandrushIslandFloorFadeLevels(floorFadeLevels, floorFadeMaterials)
    expect(root.visible).toBe(true)
    expect(readLandrushIslandFloorFadeOpacity(mesh)).toBe(1)
    expect(material.transparent).toBe(false)
    expect(floorFadeLevels.size).toBe(0)
    expect(floorFadeMaterials.size).toBe(0)

    mesh.geometry.dispose()
    material.dispose()
  })
})
