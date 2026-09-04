import { describe, expect, test } from 'bun:test'
import {
  findLandrushBuildingFloorContext,
  findLandrushBuildingFloorInteriorRegion,
  findLandrushBuildingFloorPlacement,
  resolveLandrushBuildingActiveFloorCoverNodeIds,
  resolveLandrushBuildingFloorCovers,
  resolveLandrushBuildingFloorInteriorRegions,
  resolveLandrushBuildingFloorOpacities,
  resolveLandrushBuildingFloorStacks,
  resolveLandrushBuildingFloorVisibility,
} from '@landrush/pascal-host/landrush-building-floor-visibility'
import {
  type AnyNode,
  BuildingNode,
  CeilingNode,
  LevelNode,
  RoofNode,
  SlabNode,
  WallNode,
} from '@pascal-app/core'

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

  test('enters on the exact footprint and retains the building across doorway-scale boundary jitter', () => {
    const { nodes } = createTestFloor()
    const stacks = resolveLandrushBuildingFloorStacks(nodes)
    const inside = findLandrushBuildingFloorContext({
      groundY: 0,
      point: { x: 9.99, z: 4.5 },
      robotWorldY: 0.1,
      stacks,
    })
    const refreshedStacks = resolveLandrushBuildingFloorStacks({ ...nodes })
    const outsideCannotEnter = findLandrushBuildingFloorContext({
      groundY: 0,
      horizontalExitMargin: 0.15,
      point: { x: 10.04, z: 4.5 },
      robotWorldY: 0.1,
      stacks,
    })
    const retainedOutside = findLandrushBuildingFloorContext({
      groundY: 0,
      horizontalExitMargin: 0.15,
      point: { x: 10.04, z: 4.5 },
      previousContext: inside,
      robotWorldY: 0.1,
      stacks: refreshedStacks,
    })
    const retainedInside = findLandrushBuildingFloorContext({
      groundY: 0,
      horizontalExitMargin: 0.15,
      point: { x: 9.98, z: 4.5 },
      previousContext: retainedOutside,
      robotWorldY: 0.1,
      stacks,
    })
    const exited = findLandrushBuildingFloorContext({
      groundY: 0,
      horizontalExitMargin: 0.15,
      point: { x: 10.16, z: 4.5 },
      previousContext: retainedInside,
      robotWorldY: 0.1,
      stacks,
    })

    expect(inside).not.toBeNull()
    expect(outsideCannotEnter).toBeNull()
    expect(retainedOutside?.scopeId).toBe(inside?.scopeId)
    expect(retainedOutside?.floor).not.toBe(inside?.floor)
    expect(retainedInside?.scopeId).toBe(inside?.scopeId)
    expect(exited).toBeNull()
  })

  test('fades only the floor reached by a parcel stair while other parcels stay visible', () => {
    const building = BuildingNode.parse({ name: 'Shared island building root' })
    const nodes = { [building.id]: building } as Record<string, AnyNode>
    const parcelAFloors = createParcelFloorStack(nodes, building.id, 'parcel-a', 0)
    const parcelBFloors = createParcelFloorStack(nodes, building.id, 'parcel-b', 20)
    const stacks = resolveLandrushBuildingFloorStacks(nodes)
    const context = findLandrushBuildingFloorContext({
      groundY: 0,
      point: { x: 5, z: 4.5 },
      robotWorldY: 0.1,
      stacks,
    })
    const opacities = resolveLandrushBuildingFloorOpacities(stacks, context, {
      lowerLevelNumber: 0,
      scopeId: 'parcel:parcel-a',
      upperFloorVisibility: 0.5,
      upperLevelNumber: 1,
    })
    const opacityByLevelId = new Map(opacities.map(({ levelId, opacity }) => [levelId, opacity]))

    expect(opacityByLevelId.get(parcelAFloors[0]!.id)).toBe(1)
    expect(opacityByLevelId.get(parcelAFloors[1]!.id)).toBe(0.5)
    expect(opacityByLevelId.get(parcelAFloors[2]!.id)).toBe(0)
    expect(parcelBFloors.every((level) => opacityByLevelId.get(level.id) === 1)).toBe(true)
  })

  test('finds a shared level in the parcel-specific stack requested by a stair', () => {
    const building = BuildingNode.parse({ name: 'Shared island building root' })
    const nodes = { [building.id]: building } as Record<string, AnyNode>
    const sharedGroundLevel = LevelNode.parse({
      level: 0,
      name: 'Shared ground',
      parentId: building.id,
    })
    nodes[sharedGroundLevel.id] = sharedGroundLevel
    const parcelFloors = createParcelFloorStack(nodes, building.id, 'parcel-a', 0)
    const parcelGroundWall = Object.values(nodes).find(
      (node) => node.type === 'wall' && node.parentId === parcelFloors[0]!.id,
    )
    if (!parcelGroundWall) throw new Error('Expected parcel ground wall')
    parcelGroundWall.parentId = sharedGroundLevel.id
    parcelGroundWall.metadata = { landrushParcelId: 'parcel-a' }
    delete nodes[parcelFloors[0]!.id]

    const stacks = resolveLandrushBuildingFloorStacks(nodes)
    const placement = findLandrushBuildingFloorPlacement({
      levelId: sharedGroundLevel.id,
      scopeId: 'parcel:parcel-a',
      stacks,
    })

    expect(placement?.scopeId).toBe('parcel:parcel-a')
    expect(placement?.floor.baseY).toBe(0)
  })

  test('stacks a remote upper floor above its parcel content on the shared ground level', () => {
    const building = BuildingNode.parse({ name: 'Shared island building root' })
    const sharedGroundLevel = LevelNode.parse({
      level: 0,
      name: 'Shared island ground level',
      parentId: building.id,
    })
    const parcelId = 'parcel-remote'
    const parcelMetadata = { landrushBuildSynced: true, landrushParcelId: parcelId }
    const corners = [
      [0, 0],
      [10, 0],
      [10, 9],
      [0, 9],
    ] as const
    const groundWalls = corners.map((start, index) =>
      WallNode.parse({
        end: corners[(index + 1) % corners.length],
        height: 2.5,
        metadata: parcelMetadata,
        name: `Remote ground wall ${index + 1}`,
        parentId: sharedGroundLevel.id,
        start,
      }),
    )
    const groundCeiling = CeilingNode.parse({
      height: 2.55,
      metadata: parcelMetadata,
      name: 'Remote ground ceiling',
      parentId: sharedGroundLevel.id,
      polygon: corners,
    })
    const neighboringWall = WallNode.parse({
      end: [30, 9],
      height: 3,
      metadata: { landrushBuildSynced: true, landrushParcelId: 'parcel-neighbor' },
      name: 'Taller neighboring parcel wall',
      parentId: sharedGroundLevel.id,
      start: [30, 0],
    })
    const upperLevel = LevelNode.parse({
      level: 1,
      metadata: parcelMetadata,
      name: 'Remote upper floor',
      parentId: building.id,
    })
    const upperWalls = corners.map((start, index) =>
      WallNode.parse({
        end: corners[(index + 1) % corners.length],
        height: 2.5,
        metadata: parcelMetadata,
        name: `Remote upper wall ${index + 1}`,
        parentId: upperLevel.id,
        start,
      }),
    )
    const populatedGroundLevel = {
      ...sharedGroundLevel,
      children: [...groundWalls.map((wall) => wall.id), groundCeiling.id, neighboringWall.id],
    } as LevelNode
    const populatedUpperLevel = {
      ...upperLevel,
      children: upperWalls.map((wall) => wall.id),
    } as LevelNode
    const nodes = Object.fromEntries(
      [
        building,
        populatedGroundLevel,
        ...groundWalls,
        groundCeiling,
        neighboringWall,
        populatedUpperLevel,
        ...upperWalls,
      ].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    const stacks = resolveLandrushBuildingFloorStacks(nodes)
    const parcelStack = stacks.find((stack) => stack.scopeId === `parcel:${parcelId}`)
    const upperContext = findLandrushBuildingFloorContext({
      groundY: 0,
      point: { x: 5, z: 4.5 },
      robotWorldY: 2.8,
      stacks,
    })
    const groundContext = findLandrushBuildingFloorContext({
      groundY: 0,
      point: { x: 5, z: 4.5 },
      robotWorldY: 0.2,
      stacks,
    })
    const groundVisibility = resolveLandrushBuildingFloorVisibility(stacks, groundContext)

    expect(parcelStack?.floors.map((floor) => floor.baseY)).toEqual([0, 2.55])
    expect(parcelStack?.floors[0]?.levelIds).toEqual([sharedGroundLevel.id])
    expect(parcelStack?.floors[1]?.levelIds).toEqual([upperLevel.id])
    expect(upperContext?.scopeId).toBe(`parcel:${parcelId}`)
    expect(upperContext?.levelNumber).toBe(1)
    expect(groundContext?.scopeId).toBe(`parcel:${parcelId}`)
    expect(groundContext?.levelNumber).toBe(0)
    expect(groundVisibility.hiddenLevelIds).toEqual([upperLevel.id])
    expect(groundVisibility.visibleLevelIds).toContain(sharedGroundLevel.id)
  })

  test('opens the complete overhead cover of the active upper floor without hiding its contents', () => {
    const building = BuildingNode.parse({ name: 'Furnished house' })
    const parcelMetadata = { landrushParcelId: 'parcel-furnished' }
    const groundLevel = LevelNode.parse({ level: 0, parentId: building.id })
    const upperLevel = LevelNode.parse({
      level: 1,
      metadata: parcelMetadata,
      parentId: building.id,
    })
    const corners = [
      [0, 0],
      [10, 0],
      [10, 9],
      [0, 9],
    ] as const
    const walls = [groundLevel, upperLevel].flatMap((level) =>
      corners.map((start, index) =>
        WallNode.parse({
          end: corners[(index + 1) % corners.length],
          height: 3,
          metadata: parcelMetadata,
          parentId: level.id,
          start,
        }),
      ),
    )
    const nodes = Object.fromEntries(
      [building, groundLevel, upperLevel, ...walls].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>
    const upperCeiling = CeilingNode.parse({
      metadata: { ...parcelMetadata, role: 'room-ceiling' },
      name: 'Upper room ceiling',
      parentId: upperLevel.id,
      polygon: [
        [0, 0],
        [10, 0],
        [10, 9],
        [0, 9],
      ],
    })
    const roof = RoofNode.parse({
      metadata: parcelMetadata,
      name: 'Upper roof',
      parentId: upperLevel.id,
    })
    const parkedSuppressor = CeilingNode.parse({
      height: -100,
      metadata: {
        ...parcelMetadata,
        nonRendering: 'parked-below-terrain',
      },
      name: 'Detector suppressor',
      parentId: upperLevel.id,
      polygon: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    })
    nodes[upperCeiling.id] = upperCeiling
    nodes[roof.id] = roof
    nodes[parkedSuppressor.id] = parkedSuppressor

    const stacks = resolveLandrushBuildingFloorStacks(nodes)
    const parcelStack = stacks.find((stack) => stack.scopeId === 'parcel:parcel-furnished')
    const covers = resolveLandrushBuildingFloorCovers(nodes, stacks)
    const context = findLandrushBuildingFloorContext({
      groundY: 0,
      point: { x: 5, z: 4.5 },
      robotWorldY: 3.2,
      stacks,
    })
    const activeCoverNodeIds = resolveLandrushBuildingActiveFloorCoverNodeIds(covers, context)

    expect(parcelStack?.floors.map(({ baseY }) => baseY)).toEqual([0, 3])
    expect(context?.levelNumber).toBe(1)
    expect(upperCeiling.height).toBeUndefined()
    expect(activeCoverNodeIds).toEqual([upperCeiling.id, roof.id].sort())
    expect(activeCoverNodeIds).not.toContain(upperLevel.id)
    expect(activeCoverNodeIds).not.toContain(parkedSuppressor.id)
    expect(resolveLandrushBuildingActiveFloorCoverNodeIds(covers, null)).toEqual([])
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
