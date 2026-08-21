import { describe, expect, test } from 'bun:test'
import type { AnyNode } from '@pascal-app/core'
import { collectLandrushZombieEscapeStructureNodeIds } from './landrush-zombie-escape-structure-presentation'

describe('Landrush Zombie Escape structure presentation', () => {
  test('selects visible permanent ground-floor structures through nested ownership', () => {
    const nodes = {
      ground: { id: 'ground', level: 0, parentId: null, type: 'level' },
      upper: { id: 'upper', level: 1, parentId: null, type: 'level' },
      wall: { id: 'wall', parentId: 'ground', type: 'wall' },
      door: { id: 'door', parentId: 'wall', type: 'door' },
      slab: { id: 'slab', parentId: 'ground', type: 'slab' },
      hidden: { id: 'hidden', parentId: 'ground', type: 'wall', visible: false },
      transient: {
        id: 'transient',
        metadata: { isTransient: true },
        parentId: 'ground',
        type: 'fence',
      },
      upperWall: { id: 'upper-wall', parentId: 'upper', type: 'wall' },
      item: { id: 'item', parentId: 'ground', type: 'item' },
    } as unknown as Record<string, AnyNode>

    expect(collectLandrushZombieEscapeStructureNodeIds(nodes)).toEqual(['door', 'slab', 'wall'])
  })
})
