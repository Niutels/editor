import { describe, expect, test } from 'bun:test'
import { type AnyNode, BuildingNode, LevelNode, SpawnNode } from '@pascal-app/core'
import { resolveLevelSpawnSingleton } from '../placement'

function sceneWithSpawns() {
  const building = BuildingNode.parse({ id: 'building_spawn_test' })
  const ground = LevelNode.parse({ id: 'level_spawn_ground', parentId: building.id })
  const upper = LevelNode.parse({ id: 'level_spawn_upper', level: 1, parentId: building.id })
  const nodes: Record<string, AnyNode> = {
    [building.id]: building,
    [ground.id]: ground,
    [upper.id]: upper,
    spawnGroundB: SpawnNode.parse({ id: 'spawn_ground_b', parentId: ground.id }),
    spawnGroundA: SpawnNode.parse({ id: 'spawn_ground_a', parentId: ground.id }),
    spawnUpper: SpawnNode.parse({ id: 'spawn_upper', parentId: upper.id }),
  }
  return { ground, nodes, upper }
}

describe('spawn placement singleton', () => {
  test('chooses a deterministic spawn and only prunes duplicates on the active level', () => {
    const { ground, nodes } = sceneWithSpawns()

    expect(resolveLevelSpawnSingleton(nodes, ground.id)).toEqual({
      duplicateIds: ['spawn_ground_b'],
      existingId: 'spawn_ground_a',
    })
  })

  test('never treats a spawn on another level as the active singleton', () => {
    const { nodes, upper } = sceneWithSpawns()

    expect(resolveLevelSpawnSingleton(nodes, upper.id)).toEqual({
      duplicateIds: [],
      existingId: 'spawn_upper',
    })
    expect(resolveLevelSpawnSingleton(nodes, 'level_without_spawn')).toEqual({
      duplicateIds: [],
      existingId: null,
    })
  })
})
