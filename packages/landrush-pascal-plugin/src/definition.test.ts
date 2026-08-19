import { describe, expect, test } from 'bun:test'
import { landrushLayoutDefinition } from './landrush-layout/definition'
import { LandrushLayoutNode } from './landrush-layout/schema'
import { landrushWorldDefinition } from './landrush-world/definition'
import { LandrushWorldNode } from './landrush-world/schema'
import { pascalWaterDefinition } from './pascal-water/definition'

describe('Landrush plugin dirty tracking', () => {
  test('opts renderer-owned and data-only nodes out of the geometry rebuild queue', () => {
    expect(landrushLayoutDefinition.dirtyTracking).toBe(false)
    expect(landrushWorldDefinition.dirtyTracking).toBe(false)
    expect(pascalWaterDefinition.dirtyTracking).toBe(false)
  })
})

describe('Landrush durable layout schema', () => {
  test('is the shared base for the rendered world node', () => {
    for (const field of [
      'position',
      'seed',
      'size',
      'perimeter',
      'parcels',
      'ownerParcelId',
      'roads',
      'trees',
      'playerStart',
    ] as const) {
      expect(LandrushWorldNode.shape[field]).toBe(LandrushLayoutNode.shape[field])
    }
  })

  test('keeps transient player and renderer state out of saved layouts', () => {
    const layout = LandrushLayoutNode.parse({
      id: 'landrush-layout_test',
      type: 'landrush-layout',
    })
    const world = LandrushWorldNode.parse({
      ...layout,
      id: 'landrush-world_test',
      type: 'landrush-world',
    })

    expect(layout).not.toHaveProperty('playerPosition')
    expect(layout).not.toHaveProperty('remotePlayers')
    expect(layout).not.toHaveProperty('renderFlags')
    expect(world.seed).toBe(layout.seed)
    expect(world.perimeter).toEqual(layout.perimeter)
    expect(world.playerPosition).toEqual([0, 0, 0])
  })
})
