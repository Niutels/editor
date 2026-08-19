import { describe, expect, test } from 'bun:test'
import {
  createLandrushIslandParcelOptions,
  createLandrushIslandParcelOwnershipWorldId,
  createLandrushIslandSceneGraph,
  LANDRUSH_ISLAND_BUILDING_ID,
  LANDRUSH_ISLAND_EXPERIENCE_CONFIGS,
  LANDRUSH_ISLAND_LEVEL_ID,
  LANDRUSH_ISLAND_NODE_ID,
} from './landrush-island-world'
import {
  PASCAL_WORLD_ELEVATION_PARAMETERS,
  PASCAL_WORLD_WATER_MATERIAL_PARAMETERS,
} from './pascal-world-visual-defaults'
import {
  WATER_LAB_DEFAULT_FIELD_PARAMETERS,
  WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
} from './water-lab-parameters'

const sceneOptions = {
  elevationParameters: PASCAL_WORLD_ELEVATION_PARAMETERS,
  fieldParameters: WATER_LAB_DEFAULT_FIELD_PARAMETERS,
  islandParameters: WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
  layoutConfig: LANDRUSH_ISLAND_EXPERIENCE_CONFIGS['pascal-multiplayer-island'],
  materialParameters: PASCAL_WORLD_WATER_MATERIAL_PARAMETERS,
  showDepthReference: false,
  terrainFieldResolution: 384,
}

describe('Landrush island world composition', () => {
  test('generates the same world and cadastral identity for the same seed', () => {
    const first = createLandrushIslandSceneGraph(sceneOptions)
    const second = createLandrushIslandSceneGraph(sceneOptions)
    const parcelOptions = createLandrushIslandParcelOptions(first.landrushLayoutNode.seed)

    expect(second).toEqual(first)
    expect(first.landrushLayoutNode.parcels).toHaveLength(12)
    expect(first.landrushLayoutNode.roads.segments.length).toBeGreaterThan(0)
    expect(createLandrushIslandParcelOwnershipWorldId(parcelOptions)).toBe(
      createLandrushIslandParcelOwnershipWorldId({
        ...parcelOptions,
        roadReserveMeters: parcelOptions.roadReserveMeters + 1,
      }),
    )
  })

  test('keeps the stable Pascal scene envelope around Landrush-owned world data', () => {
    const { landrushLayoutNode, sceneGraph, waterNode } =
      createLandrushIslandSceneGraph(sceneOptions)

    expect(sceneGraph.rootNodeIds).toEqual(['site_landrush-island-debug'])
    expect(sceneGraph.nodes[LANDRUSH_ISLAND_BUILDING_ID]?.children).toEqual([
      LANDRUSH_ISLAND_LEVEL_ID,
    ])
    expect(sceneGraph.nodes[LANDRUSH_ISLAND_LEVEL_ID]?.children).toEqual([
      LANDRUSH_ISLAND_NODE_ID,
      landrushLayoutNode.id,
    ])
    expect(sceneGraph.nodes[waterNode.id]).toEqual(waterNode)
    expect(sceneGraph.nodes[landrushLayoutNode.id]).toEqual(landrushLayoutNode)

    const site = sceneGraph.nodes[sceneGraph.rootNodeIds[0]!]
    expect(site?.type).toBe('site')
    if (site?.type !== 'site') throw new Error('Landrush scene root must be a Pascal site node')
    expect(site.visible).toBe(true)
    expect(site.polygon.points.length).toBeGreaterThanOrEqual(3)
  })

  test('can omit the Pascal water node without changing the Landrush layout', () => {
    const full = createLandrushIslandSceneGraph(sceneOptions)
    const withoutWater = createLandrushIslandSceneGraph({ ...sceneOptions, omitWaterNode: true })

    expect(withoutWater.landrushLayoutNode).toEqual(full.landrushLayoutNode)
    expect(withoutWater.sceneGraph.nodes[LANDRUSH_ISLAND_NODE_ID]).toBeUndefined()
    expect(withoutWater.sceneGraph.nodes[LANDRUSH_ISLAND_LEVEL_ID]?.children).toEqual([
      withoutWater.landrushLayoutNode.id,
    ])
  })
})
