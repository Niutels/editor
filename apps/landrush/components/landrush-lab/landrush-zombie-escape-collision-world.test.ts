import { describe, expect, mock, test } from 'bun:test'
import {
  type AnyNode,
  BuildingNode,
  DoorNode,
  FenceNode,
  LevelNode,
  WallNode,
} from '@pascal-app/core'
import {
  createLandrushZombieEscapeCollisionSegments,
  createLandrushZombieEscapeCollisionSemanticsKey,
  createLandrushZombieEscapeCollisionWorld,
  createLandrushZombieEscapeCollisionWorldResolver,
} from './landrush-zombie-escape-collision-world'
import { zombieEscapeSegmentIsClear } from './zombie-escape-collision-world'

describe('Landrush Zombie Escape collision adapter', () => {
  test('emits stable ground-floor wall runs with the hosted door removed', () => {
    const building = BuildingNode.parse({ name: 'House' })
    const ground = LevelNode.parse({ level: 0, name: 'Ground', parentId: building.id })
    const upper = LevelNode.parse({ level: 1, name: 'Upper', parentId: building.id })
    const groundWall = WallNode.parse({
      end: [4, 0],
      name: 'Ground wall',
      parentId: ground.id,
      start: [0, 0],
    })
    const upperWall = WallNode.parse({
      end: [4, 2],
      name: 'Upper wall',
      parentId: upper.id,
      start: [0, 2],
    })
    const door = DoorNode.parse({
      name: 'Door',
      openingKind: 'opening',
      parentId: groundWall.id,
      position: [2, 0, 0],
      wallId: groundWall.id,
      width: 0.9,
    })
    const nodes = Object.fromEntries(
      [building, ground, upper, groundWall, upperWall, door].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>
    const reversed = Object.fromEntries(Object.entries(nodes).reverse()) as Record<string, AnyNode>

    const first = createLandrushZombieEscapeCollisionSegments(nodes, { x: 1, z: -1 })
    const second = createLandrushZombieEscapeCollisionSegments(reversed, { x: 1, z: -1 })

    expect(second).toEqual(first)
    expect(first).toHaveLength(2)
    expect(first[0]?.startX).toBeCloseTo(-1)
    expect(first[0]?.endX).toBeCloseTo(0.55)
    expect(first[1]?.startX).toBeCloseTo(1.45)
    expect(first[1]?.endX).toBeCloseTo(3)
    expect(first.every(({ startZ, endZ }) => startZ === 1 && endZ === 1)).toBe(true)
    expect(first.every(({ id }) => id.startsWith(groundWall.id))).toBe(true)
    expect(first.every(({ objectId }) => objectId === groundWall.id)).toBe(true)
  })

  test('keeps a closed door solid and opens only its runtime-authorized aperture', () => {
    const level = LevelNode.parse({ level: 0, name: 'Ground' })
    const wall = WallNode.parse({ end: [4, 0], parentId: level.id, start: [0, 0] })
    const door = DoorNode.parse({
      parentId: wall.id,
      position: [2, 0, 0],
      wallId: wall.id,
      width: 1,
    })
    const nodes = Object.fromEntries([level, wall, door].map((node) => [node.id, node])) as Record<
      string,
      AnyNode
    >

    const closed = createLandrushZombieEscapeCollisionSegments(nodes, { x: 0, z: 0 })
    const open = createLandrushZombieEscapeCollisionSegments(
      nodes,
      { x: 0, z: 0 },
      { [door.id]: true },
    )

    expect(closed).toHaveLength(3)
    expect(closed.filter(({ objectId }) => objectId === wall.id)).toHaveLength(2)
    expect(closed.filter(({ objectId }) => objectId === door.id)).toHaveLength(1)
    expect(open).toHaveLength(2)
    expect(open.every(({ objectId }) => objectId === wall.id)).toBe(true)
  })

  test('projects building translation and yaw into spawn-local collision coordinates', () => {
    const building = BuildingNode.parse({ position: [10, 0, 5], rotation: [0, Math.PI / 2, 0] })
    const level = LevelNode.parse({ level: 0, parentId: building.id })
    const wall = WallNode.parse({ end: [2, 0], parentId: level.id, start: [0, 0] })
    const nodes = Object.fromEntries(
      [building, level, wall].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    const [segment] = createLandrushZombieEscapeCollisionSegments(nodes, { x: 10, z: 5 })

    expect(segment?.startX).toBeCloseTo(0, 6)
    expect(segment?.startZ).toBeCloseTo(0, 6)
    expect(segment?.endX).toBeCloseTo(0, 6)
    expect(segment?.endZ).toBeCloseTo(-2, 6)
  })

  test('samples Pascal curved walls and spline fences instead of their endpoint chords', () => {
    const building = BuildingNode.parse({ name: 'Curved house' })
    const level = LevelNode.parse({ level: 0, parentId: building.id })
    const curvedWall = WallNode.parse({
      curveOffset: 1,
      end: [4, 0],
      parentId: level.id,
      start: [0, 0],
    })
    const splineFence = FenceNode.parse({
      end: [4, 0],
      parentId: level.id,
      path: [
        [0, 0],
        [2, 2],
        [4, 0],
      ],
      start: [0, 0],
    })
    const nodes = Object.fromEntries(
      [building, level, curvedWall, splineFence].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    const segments = createLandrushZombieEscapeCollisionSegments(nodes, { x: 0, z: 0 })
    const wallSegments = segments.filter(({ id }) => id.startsWith(curvedWall.id))
    const fenceSegments = segments.filter(({ id }) => id.startsWith(splineFence.id))

    expect(wallSegments.length).toBeGreaterThan(20)
    expect(fenceSegments.length).toBeGreaterThan(40)
    expect(
      Math.max(...wallSegments.flatMap(({ startZ, endZ }) => [Math.abs(startZ), Math.abs(endZ)])),
    ).toBeGreaterThan(0.8)
    expect(
      Math.max(...fenceSegments.flatMap(({ startZ, endZ }) => [Math.abs(startZ), Math.abs(endZ)])),
    ).toBeGreaterThan(1.8)
  })

  test('preserves simulation-local vertical spans for height-aware line of sight', () => {
    const building = BuildingNode.parse({ position: [10, 5, 5] })
    const level = LevelNode.parse({ baseElevation: 0.2, level: 0, parentId: building.id })
    const wall = WallNode.parse({
      end: [2, 0],
      height: 2.4,
      parentId: level.id,
      start: [0, 0],
      supportOffset: 0.1,
    })
    const nodes = Object.fromEntries(
      [building, level, wall].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    const [segment] = createLandrushZombieEscapeCollisionSegments(nodes, { x: 10, z: 5 }, {}, 5)

    expect(segment?.minimumY).toBeCloseTo(0.3, 6)
    expect(segment?.maximumY).toBeCloseTo(2.7, 6)
  })

  test('uses flat doorway ends so every catalog-sized zombie can traverse a 0.9 meter opening', () => {
    const level = LevelNode.parse({ level: 0 })
    const wall = WallNode.parse({ end: [4, 0], parentId: level.id, start: [0, 0] })
    const door = DoorNode.parse({
      openingKind: 'opening',
      parentId: wall.id,
      position: [2, 0, 0],
      wallId: wall.id,
      width: 0.9,
    })
    const nodes = Object.fromEntries([level, wall, door].map((node) => [node.id, node])) as Record<
      string,
      AnyNode
    >
    const world = createLandrushZombieEscapeCollisionWorld({
      agentRadius: 0.37,
      nodes,
      playRadius: 8,
      spawn: { x: 0, z: 0 },
    })

    expect(world.segments.map(({ endCap, startCap }) => [startCap, endCap])).toEqual([
      ['round', 'flat'],
      ['flat', 'round'],
    ])
    expect(zombieEscapeSegmentIsClear(world, 2, -2, 2, 2, 0.37)).toBe(true)
  })

  test('keeps non-door wall endpoints rounded so closed corners cannot leak', () => {
    const level = LevelNode.parse({ level: 0 })
    const walls = [
      WallNode.parse({ end: [4, 0], parentId: level.id, start: [0, 0] }),
      WallNode.parse({ end: [4, 4], parentId: level.id, start: [4, 0] }),
      WallNode.parse({ end: [0, 4], parentId: level.id, start: [4, 4] }),
      WallNode.parse({ end: [0, 0], parentId: level.id, start: [0, 4] }),
    ]
    const nodes = Object.fromEntries([level, ...walls].map((node) => [node.id, node])) as Record<
      string,
      AnyNode
    >
    const world = createLandrushZombieEscapeCollisionWorld({
      agentRadius: 0.37,
      nodes,
      playRadius: 8,
      spawn: { x: 0, z: 0 },
    })

    expect(
      world.segments.every(({ endCap, startCap }) => endCap === 'round' && startCap === 'round'),
    ).toBe(true)
    expect(zombieEscapeSegmentIsClear(world, 0.7, 0.7, -0.7, -0.7, 0.37)).toBe(false)
  })

  test('keeps the semantic key stable across ordering, unrelated nodes, and transient drafts', () => {
    const fixture = createCollisionSemanticsFixture()
    const baseKey = createLandrushZombieEscapeCollisionSemanticsKey(fixture.nodes)
    const unrelatedItem = {
      id: 'item_collision_observer_only',
      object: 'node',
      parentId: fixture.level.id,
      type: 'item',
    } as AnyNode
    const transientWall = {
      ...fixture.wall,
      children: [],
      end: [80, 80],
      id: 'wall_collision_transient',
      metadata: { isTransient: true },
    } as AnyNode
    const irrelevantChanges = {
      ...fixture.nodes,
      [fixture.level.id]: {
        ...fixture.level,
        children: [...fixture.level.children, unrelatedItem.id],
        name: 'Renamed ground level',
      } as AnyNode,
      [fixture.wall.id]: {
        ...fixture.wall,
        children: [...fixture.wall.children, unrelatedItem.id],
        name: 'Renamed and repainted wall',
        slots: { interior: 'scene:paint' },
      } as AnyNode,
      [unrelatedItem.id]: unrelatedItem,
      [transientWall.id]: transientWall,
    }

    expect(createLandrushZombieEscapeCollisionSemanticsKey(irrelevantChanges)).toBe(baseKey)
    expect(
      createLandrushZombieEscapeCollisionSemanticsKey(
        Object.fromEntries(Object.entries(irrelevantChanges).reverse()) as Record<string, AnyNode>,
      ),
    ).toBe(baseKey)
    expect(
      createLandrushZombieEscapeCollisionSemanticsKey({
        ...irrelevantChanges,
        [fixture.door.id]: {
          ...fixture.door,
          name: 'Restyled closed door',
          segments: fixture.door.segments.map((segment) => ({ ...segment, type: 'glass' })),
        } as AnyNode,
      }),
    ).toBe(baseKey)
  })

  test('changes the semantic key for every scene field consumed by collision generation', () => {
    const fixture = createCollisionSemanticsFixture()
    const baseKey = createLandrushZombieEscapeCollisionSemanticsKey(fixture.nodes)
    const replace = (id: string, node: AnyNode) => ({ ...fixture.nodes, [id]: node })
    const relevantChanges: Record<string, AnyNode>[] = [
      replace(fixture.wall.id, { ...fixture.wall, end: [5, 0] } as AnyNode),
      replace(fixture.wall.id, { ...fixture.wall, curveOffset: 0.5 } as AnyNode),
      replace(fixture.wall.id, { ...fixture.wall, thickness: 0.3 } as AnyNode),
      replace(fixture.wall.id, { ...fixture.wall, visible: false } as AnyNode),
      replace(fixture.wall.id, {
        ...fixture.wall,
        metadata: { ...fixture.wall.metadata, isTransient: true },
      } as AnyNode),
      replace(fixture.fence.id, {
        ...fixture.fence,
        path: [
          [0, 2],
          [2, 3],
          [4, 2],
        ],
      } as AnyNode),
      replace(fixture.fence.id, { ...fixture.fence, supportOffset: 0.4 } as AnyNode),
      replace(fixture.door.id, { ...fixture.door, position: [2.5, 0, 0] } as AnyNode),
      replace(fixture.door.id, { ...fixture.door, width: 1.2 } as AnyNode),
      replace(fixture.level.id, { ...fixture.level, baseElevation: 0.4 } as AnyNode),
      replace(fixture.level.id, { ...fixture.level, height: 3.2 } as AnyNode),
      replace(fixture.building.id, {
        ...fixture.building,
        position: [4, 1, -2],
      } as AnyNode),
      replace(fixture.building.id, {
        ...fixture.building,
        rotation: [0, Math.PI / 3, 0],
      } as AnyNode),
    ]

    for (const nodes of relevantChanges) {
      expect(createLandrushZombieEscapeCollisionSemanticsKey(nodes)).not.toBe(baseKey)
    }
    expect(
      createLandrushZombieEscapeCollisionSemanticsKey(fixture.nodes, {
        [fixture.door.id]: true,
      }),
    ).not.toBe(baseKey)
  })

  test('reuses the exact world for irrelevant identity churn and rebuilds for wall, door, and undo changes', () => {
    const fixture = createCollisionSemanticsFixture()
    const createWorld = mock(createLandrushZombieEscapeCollisionWorld)
    const resolveWorld = createLandrushZombieEscapeCollisionWorldResolver(createWorld)
    const input = {
      agentRadius: 0.37,
      nodes: fixture.nodes,
      playRadius: 8,
      spawn: { x: 0, z: 0 },
    }

    const initial = resolveWorld(input)
    const unrelated = resolveWorld({
      ...input,
      nodes: {
        ...fixture.nodes,
        item_unrelated: {
          id: 'item_unrelated',
          object: 'node',
          parentId: fixture.level.id,
          type: 'item',
        } as AnyNode,
      },
    })
    expect(unrelated).toBe(initial)
    expect(createWorld).toHaveBeenCalledTimes(1)

    const movedWallNodes = {
      ...fixture.nodes,
      [fixture.wall.id]: { ...fixture.wall, end: [5, 0] } as AnyNode,
    }
    const movedWall = resolveWorld({ ...input, nodes: movedWallNodes })
    expect(movedWall).not.toBe(initial)
    expect(createWorld).toHaveBeenCalledTimes(2)

    const openedDoor = resolveWorld({
      ...input,
      doorPassability: { [fixture.door.id]: true },
      nodes: movedWallNodes,
    })
    expect(openedDoor).not.toBe(movedWall)
    expect(createWorld).toHaveBeenCalledTimes(3)
    expect(
      resolveWorld({
        ...input,
        doorPassability: { [fixture.door.id]: true },
        nodes: { ...movedWallNodes },
      }),
    ).toBe(openedDoor)
    expect(createWorld).toHaveBeenCalledTimes(3)

    const afterUndo = resolveWorld(input)
    expect(afterUndo).not.toBe(initial)
    expect(createWorld).toHaveBeenCalledTimes(4)
  })

  test('does not poison the last good resolver entry when a rebuild throws', () => {
    const fixture = createCollisionSemanticsFixture()
    let throwNext = true
    const createWorld = mock(
      (input: Parameters<typeof createLandrushZombieEscapeCollisionWorld>[0]) => {
        if (input.nodes[fixture.wall.id]?.name === 'Throw once' && throwNext) {
          throwNext = false
          throw new Error('synthetic rebuild failure')
        }
        return createLandrushZombieEscapeCollisionWorld(input)
      },
    )
    const resolveWorld = createLandrushZombieEscapeCollisionWorldResolver(createWorld)
    const input = {
      agentRadius: 0.37,
      nodes: fixture.nodes,
      playRadius: 8,
      spawn: { x: 0, z: 0 },
    }
    const initial = resolveWorld(input)
    const changed = {
      ...input,
      nodes: {
        ...fixture.nodes,
        [fixture.wall.id]: { ...fixture.wall, end: [5, 0], name: 'Throw once' } as AnyNode,
      },
    }

    expect(() => resolveWorld(changed)).toThrow('synthetic rebuild failure')
    const recovered = resolveWorld(changed)
    expect(recovered).not.toBe(initial)
    expect(createWorld).toHaveBeenCalledTimes(3)
  })
})

function createCollisionSemanticsFixture() {
  const building = BuildingNode.parse({ name: 'Observer house' })
  const initialLevel = LevelNode.parse({
    height: 2.5,
    level: 0,
    name: 'Ground',
    parentId: building.id,
  })
  const initialWall = WallNode.parse({
    end: [4, 0],
    name: 'Observed wall',
    parentId: initialLevel.id,
    start: [0, 0],
  })
  const door = DoorNode.parse({
    name: 'Observed door',
    parentId: initialWall.id,
    position: [2, 0, 0],
    wallId: initialWall.id,
    width: 0.9,
  })
  const fence = FenceNode.parse({
    end: [4, 2],
    parentId: initialLevel.id,
    start: [0, 2],
  })
  const wall = WallNode.parse({ ...initialWall, children: [door.id] })
  const level = LevelNode.parse({ ...initialLevel, children: [wall.id, fence.id] })
  const nodes = Object.fromEntries(
    [building, level, wall, door, fence].map((node) => [node.id, node]),
  ) as Record<string, AnyNode>
  return { building, door, fence, level, nodes, wall }
}
