import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeCollisionWorld,
  createZombieEscapeCollisionWorldActiveView,
  createZombieEscapeCollisionWorldWithoutObjects,
  resolveZombieEscapePinnedNavigationLayerIndex,
  ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND,
  type ZombieEscapeCollisionBoxSource,
} from '@landrush/zombie-gameplay/zombie-escape-collision-world'

describe('Zombie Escape collision object semantics', () => {
  test('aligns semantic kinds with sorted object ordinals and authenticates them', () => {
    const boxes = [createBox('other'), createBox('furniture'), createBox('door')]
    const objectSemantics = [
      {
        objectId: 'furniture',
        semanticKind: ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.furniture,
      },
      {
        objectId: 'door',
        semanticKind: ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door,
      },
    ] as const
    const world = createZombieEscapeCollisionWorld({
      agentRadius: 0.3,
      boxes,
      objectSemantics,
      playRadius: 5,
    })
    const otherWorld = createZombieEscapeCollisionWorld({
      agentRadius: 0.3,
      boxes,
      objectSemantics: objectSemantics.map(({ objectId }) => ({
        objectId,
        semanticKind: ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.other,
      })),
      playRadius: 5,
    })
    const reorderedWorld = createZombieEscapeCollisionWorld({
      agentRadius: 0.3,
      boxes: [...boxes].reverse(),
      objectSemantics: [...objectSemantics].reverse(),
      playRadius: 5,
    })

    expect(world.objectCatalog.objectIds).toEqual(['door', 'furniture', 'other'])
    expect(world.objectCatalog.objectSemanticKinds).toEqual(
      new Uint8Array([
        ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door,
        ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.furniture,
        ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.other,
      ]),
    )
    expect(world.semanticKey).not.toBe(otherWorld.semanticKey)
    expect(world.revision).not.toBe(otherWorld.revision)
    expect(reorderedWorld.semanticKey).toBe(world.semanticKey)
    expect(reorderedWorld.revision).toBe(world.revision)
  })

  test('preserves aligned kinds through object removal and active views', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: 0.3,
      boxes: [createBox('door'), createBox('furniture'), createBox('other')],
      objectSemantics: [
        {
          objectId: 'door',
          semanticKind: ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door,
        },
        {
          objectId: 'furniture',
          semanticKind: ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.furniture,
        },
      ],
      playRadius: 5,
    })
    const withoutFurniture = createZombieEscapeCollisionWorldWithoutObjects(
      world,
      new Set(['furniture']),
    )
    const activeView = createZombieEscapeCollisionWorldActiveView(withoutFurniture)

    expect(withoutFurniture.objectCatalog.objectIds).toEqual(['door', 'other'])
    expect(withoutFurniture.objectCatalog.objectSemanticKinds).toEqual(
      new Uint8Array([
        ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door,
        ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.other,
      ]),
    )
    expect(activeView.objectCatalog.objectSemanticKinds).toBe(
      withoutFurniture.objectCatalog.objectSemanticKinds,
    )
  })

  test('rejects conflicting semantic kinds for one object', () => {
    expect(() =>
      createZombieEscapeCollisionWorld({
        agentRadius: 0.3,
        boxes: [createBox('door')],
        objectSemantics: [
          {
            objectId: 'door',
            semanticKind: ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door,
          },
          {
            objectId: 'door',
            semanticKind: ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.other,
          },
        ],
        playRadius: 5,
      }),
    ).toThrow('conflicting semantic kinds')
  })
})

describe('Zombie Escape pinned navigation layers', () => {
  test('pins an exact layer before support projection and otherwise falls back fail-closed', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: 0.3,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'lower',
          polygon: square(-2, -2, 2, 2),
        },
        {
          elevation: 3,
          id: 'upper',
          polygon: square(8, -2, 12, 2),
        },
      ],
      playRadius: 20,
    })

    expect(world.navigationLayers.map(({ elevation }) => elevation)).toEqual([0, 3])
    expect(resolveZombieEscapePinnedNavigationLayerIndex(world, 50, 50, 3)).toBe(1)
    expect(resolveZombieEscapePinnedNavigationLayerIndex(world, 0, 0, 2)).toBe(0)
    expect(resolveZombieEscapePinnedNavigationLayerIndex(world, 50, 50, 2)).toBe(-1)
  })
})

function createBox(objectId: string): ZombieEscapeCollisionBoxSource {
  return {
    breakable: true,
    centerX: objectId.length / 2,
    centerZ: 0,
    halfDepth: 0.25,
    halfWidth: 0.25,
    id: `box:${objectId}`,
    objectId,
    rotation: 0,
  }
}

function square(minimumX: number, minimumZ: number, maximumX: number, maximumZ: number) {
  return [
    { x: minimumX, z: minimumZ },
    { x: maximumX, z: minimumZ },
    { x: maximumX, z: maximumZ },
    { x: minimumX, z: maximumZ },
  ]
}
