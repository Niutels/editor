import { describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  BuildingNode,
  CeilingNode,
  LevelNode,
  SlabNode,
  WallNode,
} from '@pascal-app/core'
import {
  findLandrushBuildingFloorContext,
  findLandrushBuildingFloorInteriorRegion,
  resolveLandrushBuildingFloorInteriorRegions,
  resolveLandrushBuildingFloorStacks,
  resolveLandrushBuildingFloorVisibility,
} from './landrush-building-floor-visibility'

function createTestFloor() {
  const building = BuildingNode.parse({ name: 'House' })
  const level = LevelNode.parse({ level: 0, name: 'Ground floor', parentId: building.id })
  const corners = [
    [0, 0],
    [10, 0],
    [10, 9],
    [0, 9],
  ] as const
  const walls = corners.map((start, index) =>
    WallNode.parse({
      end: corners[(index + 1) % corners.length],
      name: `Wall ${index + 1}`,
      parentId: level.id,
      start,
    }),
  )
  const nodes = Object.fromEntries(
    [building, level, ...walls].map((node) => [node.id, node]),
  ) as Record<string, AnyNode>

  return { level, nodes }
}

describe('Landrush building floor visibility', () => {
  test('uses Pascal closed-wall spaces as the interior of a 90 m2 floor', () => {
    const { level, nodes } = createTestFloor()
    const regions = resolveLandrushBuildingFloorInteriorRegions(nodes, level.id)

    expect(regions).toHaveLength(1)
    expect(regions[0]?.source).toBe('closed-walls')
    expect(findLandrushBuildingFloorInteriorRegion({ x: 5, z: 4.5 }, regions)).not.toBeNull()
    expect(findLandrushBuildingFloorInteriorRegion({ x: 12, z: 4.5 }, regions)).toBeNull()
  })

  test('keeps rooms separated by internal walls on the same floor visible together', () => {
    const { level, nodes } = createTestFloor()
    const divider = WallNode.parse({
      end: [5, 9],
      name: 'Room divider',
      parentId: level.id,
      start: [5, 0],
    })
    nodes[divider.id] = divider
    const regions = resolveLandrushBuildingFloorInteriorRegions(nodes, level.id)

    expect(regions).toHaveLength(2)
    expect(findLandrushBuildingFloorInteriorRegion({ x: 2, z: 4 }, regions)).not.toBeNull()
    expect(findLandrushBuildingFloorInteriorRegion({ x: 8, z: 4 }, regions)).not.toBeNull()
  })

  test('falls back to a ceiling footprint when no closed wall graph exists', () => {
    const building = BuildingNode.parse({ name: 'Open building' })
    const level = LevelNode.parse({ level: 0, name: 'Ground floor', parentId: building.id })
    const ceiling = CeilingNode.parse({
      name: 'Ceiling',
      parentId: level.id,
      polygon: [
        [0, 0],
        [6, 0],
        [6, 4],
        [0, 4],
      ],
      holes: [
        [
          [2, 1],
          [4, 1],
          [4, 3],
          [2, 3],
        ],
      ],
    })
    const nodes = Object.fromEntries(
      [building, level, ceiling].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>
    const regions = resolveLandrushBuildingFloorInteriorRegions(nodes, level.id)

    expect(regions[0]?.source).toBe('ceiling')
    expect(findLandrushBuildingFloorInteriorRegion({ x: 1, z: 2 }, regions)).not.toBeNull()
    expect(findLandrushBuildingFloorInteriorRegion({ x: 3, z: 2 }, regions)).toBeNull()
  })

  test('does not classify a bare outdoor slab as a building interior', () => {
    const building = BuildingNode.parse({ name: 'Site' })
    const level = LevelNode.parse({ level: 0, name: 'Ground', parentId: building.id })
    const slab = SlabNode.parse({
      name: 'Patio',
      parentId: level.id,
      polygon: [
        [0, 0],
        [5, 0],
        [5, 5],
        [0, 5],
      ],
    })
    const nodes = Object.fromEntries(
      [building, level, slab].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>
    const regions = resolveLandrushBuildingFloorInteriorRegions(nodes, level.id)

    expect(regions).toHaveLength(0)
  })

  test('shows the current and lower floors only in the parcel the player entered', () => {
    const building = BuildingNode.parse({ name: 'Shared island building root' })
    const nodes = { [building.id]: building } as Record<string, AnyNode>
    const parcelAFloors = createParcelFloorStack(nodes, building.id, 'parcel-a', 0)
    const parcelBFloors = createParcelFloorStack(nodes, building.id, 'parcel-b', 20)

    const stacks = resolveLandrushBuildingFloorStacks(nodes)
    const parcelAStack = stacks.find((stack) => stack.scopeId === 'parcel:parcel-a')
    const context = findLandrushBuildingFloorContext({
      groundY: 0,
      point: { x: 5, z: 4.5 },
      robotWorldY: 3.1,
      stacks,
    })
    const visibility = resolveLandrushBuildingFloorVisibility(stacks, context)

    expect(parcelAStack?.floors.map((floor) => floor.baseY)).toEqual([0, 3, 6])
    expect(context?.scopeId).toBe('parcel:parcel-a')
    expect(context?.levelNumber).toBe(1)
    expect(visibility.visibleLevelIds).toContain(parcelAFloors[0]!.id)
    expect(visibility.visibleLevelIds).toContain(parcelAFloors[1]!.id)
    expect(visibility.hiddenLevelIds).toEqual([parcelAFloors[2]!.id])
    expect(parcelBFloors.every((level) => visibility.visibleLevelIds.includes(level.id))).toBe(true)
  })

  test('keeps every parcel floor visible while the player is outside all buildings', () => {
    const building = BuildingNode.parse({ name: 'Shared island building root' })
    const nodes = { [building.id]: building } as Record<string, AnyNode>
    const levels = [
      ...createParcelFloorStack(nodes, building.id, 'parcel-a', 0),
      ...createParcelFloorStack(nodes, building.id, 'parcel-b', 20),
    ]
    const stacks = resolveLandrushBuildingFloorStacks(nodes)
    const context = findLandrushBuildingFloorContext({
      groundY: 0,
      point: { x: 15, z: 4.5 },
      robotWorldY: 3.1,
      stacks,
    })
    const visibility = resolveLandrushBuildingFloorVisibility(stacks, context)

    expect(context).toBeNull()
    expect(visibility.hiddenLevelIds).toEqual([])
    expect(new Set(visibility.visibleLevelIds)).toEqual(new Set(levels.map((level) => level.id)))
  })
})

function createParcelFloorStack(
  nodes: Record<string, AnyNode>,
  buildingId: string,
  parcelId: string,
  offsetX: number,
) {
  const levels: LevelNode[] = []
  const corners = [
    [offsetX, 0],
    [offsetX + 10, 0],
    [offsetX + 10, 9],
    [offsetX, 9],
  ] as const

  for (let floor = 0; floor < 3; floor += 1) {
    const level = LevelNode.parse({
      level: floor,
      metadata: { landrushBuildSynced: true, landrushParcelId: parcelId },
      name: `${parcelId} floor ${floor}`,
      parentId: buildingId,
    })
    const walls = corners.map((start, index) =>
      WallNode.parse({
        end: corners[(index + 1) % corners.length],
        height: 3,
        name: `${parcelId} floor ${floor} wall ${index + 1}`,
        parentId: level.id,
        start,
      }),
    )
    const populatedLevel = { ...level, children: walls.map((wall) => wall.id) } as LevelNode
    nodes[populatedLevel.id] = populatedLevel
    for (const wall of walls) nodes[wall.id] = wall
    levels.push(populatedLevel)
  }

  return levels
}
