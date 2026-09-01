import { describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  BuildingNode,
  CeilingNode,
  DoorNode,
  LevelNode,
  WallNode,
} from '@pascal-app/core'
import { findLandrushBuildingFloorInteriorRegion } from './landrush-building-floor-visibility'
import {
  resolveZombieEscapeWeaponPickupIndices,
  resolveZombieEscapeWeaponPickupPlacements,
  resolveZombieEscapeWeaponPlacementSeed,
} from './zombie-escape-weapon-placement'

const WEAPON_PLACEMENT_SEED = resolveZombieEscapeWeaponPlacementSeed({
  night: 2,
  sessionId: 'weapon-placement-test',
})

describe('Zombie Escape weapon placement', () => {
  test('keeps a seeded layout stable across scene insertion order', () => {
    const nodes = {} as Record<string, AnyNode>
    for (let index = 0; index < 7; index += 1) {
      addClosedBuilding(nodes, index * 12, 0, `Building ${String(index + 1)}`)
    }
    const reversedNodes = Object.fromEntries(Object.entries(nodes).reverse()) as Record<
      string,
      AnyNode
    >

    const first = resolveZombieEscapeWeaponPickupPlacements(nodes, WEAPON_PLACEMENT_SEED)
    const second = resolveZombieEscapeWeaponPickupPlacements(reversedNodes, WEAPON_PLACEMENT_SEED)

    expect(first).toEqual(second)
    expect(first).toHaveLength(4)
    expect(new Set(first.map(({ scopeId }) => scopeId)).size).toBe(first.length)
    expect(first.map(({ weaponIndex }) => weaponIndex).sort()).toEqual([1, 2, 3, 4])
    expect(first.every(({ y }) => y === 0)).toBe(true)
  })

  test('preserves unique paid-weapon probing for a stable session and night seed', () => {
    const scopeIds = [
      'building:house-a',
      'building:house-b',
      'building:house-c',
      'building:house-d',
    ]

    const first = resolveZombieEscapeWeaponPickupIndices(scopeIds, WEAPON_PLACEMENT_SEED)

    expect(first).toEqual(
      resolveZombieEscapeWeaponPickupIndices([...scopeIds], WEAPON_PLACEMENT_SEED),
    )
    expect([...first].sort()).toEqual([1, 2, 3, 4])
  })

  test('prioritizes a player-built parcel room ahead of built-in buildings under the paid-weapon cap', () => {
    const nodes = {} as Record<string, AnyNode>
    for (let index = 0; index < 4; index += 1) {
      addClosedBuilding(nodes, index * 12, 0, `Built-in building ${String(index + 1)}`)
    }
    addClosedBuilding(nodes, 48, 0, 'Player-built room', 'player-parcel')
    const reversedNodes = Object.fromEntries(Object.entries(nodes).reverse()) as Record<
      string,
      AnyNode
    >

    const first = resolveZombieEscapeWeaponPickupPlacements(nodes, WEAPON_PLACEMENT_SEED)
    const second = resolveZombieEscapeWeaponPickupPlacements(reversedNodes, WEAPON_PLACEMENT_SEED)

    expect(first).toEqual(second)
    expect(first).toHaveLength(4)
    expect(first[0]?.scopeId).toBe('parcel:player-parcel')
    expect(first.map(({ scopeId }) => scopeId)).toContain('parcel:player-parcel')
    expect(new Set(first.map(({ scopeId }) => scopeId)).size).toBe(first.length)
  })

  test('can change a one-house weapon when the session or night seed changes', () => {
    const nodes = {} as Record<string, AnyNode>
    addClosedBuilding(nodes, 0, 0, 'Only building', 'player-parcel')
    const firstSeed = resolveZombieEscapeWeaponPlacementSeed({ night: 0, sessionId: 'session-a' })
    const nextNightSeed = resolveZombieEscapeWeaponPlacementSeed({
      night: 1,
      sessionId: 'session-a',
    })
    const freshSessionSeed = resolveZombieEscapeWeaponPlacementSeed({
      night: 0,
      sessionId: 'session-b',
    })
    const first = resolveZombieEscapeWeaponPickupPlacements(nodes, firstSeed)

    expect(resolveZombieEscapeWeaponPickupPlacements(nodes, firstSeed)).toEqual(first)
    expect(first).toEqual([expect.objectContaining({ scopeId: 'parcel:player-parcel', y: 0 })])
    expect(
      resolveZombieEscapeWeaponPickupPlacements(nodes, nextNightSeed)[0]?.weaponIndex,
    ).not.toBe(first[0]?.weaponIndex)
    expect(
      resolveZombieEscapeWeaponPickupPlacements(nodes, freshSessionSeed)[0]?.weaponIndex,
    ).not.toBe(first[0]?.weaponIndex)
  })

  test('does not place a weapon in closed walls until a boundary door exists', () => {
    const nodes = {} as Record<string, AnyNode>
    const building = BuildingNode.parse({ name: 'Doorless building' })
    nodes[building.id] = building
    addClosedLevel(nodes, building.id, 0, 0, 0, 'Doorless ground', undefined, false)

    expect(resolveZombieEscapeWeaponPickupPlacements(nodes, WEAPON_PLACEMENT_SEED)).toEqual([])
  })

  test('places the weapon in the door-equipped room instead of a larger sealed room', () => {
    const nodes = {} as Record<string, AnyNode>
    const building = BuildingNode.parse({ name: 'Mixed access building' })
    const level = LevelNode.parse({ level: 0, name: 'Ground', parentId: building.id })
    nodes[building.id] = building
    nodes[level.id] = level
    addClosedRoom(nodes, level.id, 0, 0, 10, 8, 'Large sealed room', false)
    addClosedRoom(nodes, level.id, 14, 1, 4, 4, 'Small door room', true)

    const [placement] = resolveZombieEscapeWeaponPickupPlacements(nodes, WEAPON_PLACEMENT_SEED)

    expect(placement).toBeDefined()
    expect(placement!.x).toBeGreaterThan(14)
    expect(placement!.x).toBeLessThan(18)
    expect(placement!.z).toBeGreaterThan(1)
    expect(placement!.z).toBeLessThan(5)
  })

  test('does not use an opening-only room when another room has a real door', () => {
    const nodes = {} as Record<string, AnyNode>
    const building = BuildingNode.parse({ name: 'Mixed opening building' })
    const level = LevelNode.parse({ level: 0, name: 'Ground', parentId: building.id })
    nodes[building.id] = building
    nodes[level.id] = level
    addClosedRoom(nodes, level.id, 0, 1, 4, 4, 'Small door room', true)
    addClosedRoom(nodes, level.id, 8, 0, 10, 8, 'Large opening room', true, 'opening')

    const [placement] = resolveZombieEscapeWeaponPickupPlacements(nodes, WEAPON_PLACEMENT_SEED)

    expect(placement).toBeDefined()
    expect(placement!.x).toBeGreaterThan(0)
    expect(placement!.x).toBeLessThan(4)
    expect(placement!.z).toBeGreaterThan(1)
    expect(placement!.z).toBeLessThan(5)
  })

  test('uses level zero instead of a basement when both exist', () => {
    const nodes = {} as Record<string, AnyNode>
    const building = BuildingNode.parse({ name: 'Basement house' })
    nodes[building.id] = building
    addClosedLevel(nodes, building.id, -1, 40, 40, 'Basement', 4)
    addClosedLevel(nodes, building.id, 0, 3, 5, 'Ground')

    const [placement] = resolveZombieEscapeWeaponPickupPlacements(nodes, WEAPON_PLACEMENT_SEED)

    expect(placement).toBeDefined()
    expect(placement!.x).toBeGreaterThan(3)
    expect(placement!.x).toBeLessThan(11)
    expect(placement!.z).toBeGreaterThan(5)
    expect(placement!.z).toBeLessThan(11)
    expect(placement!.y).toBe(4)
  })

  test('does not treat a ceiling-only interior as the first house', () => {
    const building = BuildingNode.parse({ name: 'Courtyard house' })
    const level = LevelNode.parse({ level: 0, name: 'Ground', parentId: building.id })
    const region = {
      holes: [
        [
          [3, 3],
          [7, 3],
          [7, 7],
          [3, 7],
        ] as const,
      ],
      polygon: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ] as const,
      source: 'ceiling' as const,
    }
    const ceiling = CeilingNode.parse({
      holes: region.holes.map((hole) => [...hole]),
      name: 'Courtyard ceiling',
      parentId: level.id,
      polygon: [...region.polygon],
    })
    const nodes = Object.fromEntries(
      [building, level, ceiling].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    expect(findLandrushBuildingFloorInteriorRegion({ x: 1, z: 1 }, [region])).not.toBeNull()
    expect(resolveZombieEscapeWeaponPickupPlacements(nodes, WEAPON_PLACEMENT_SEED)).toEqual([])
  })
})

function addClosedBuilding(
  nodes: Record<string, AnyNode>,
  offsetX: number,
  offsetZ: number,
  name: string,
  parcelId?: string,
) {
  const building = BuildingNode.parse({ name })
  nodes[building.id] = building
  addClosedLevel(
    nodes,
    building.id,
    0,
    offsetX,
    offsetZ,
    `${name} ground`,
    undefined,
    true,
    parcelId,
  )
}

function addClosedLevel(
  nodes: Record<string, AnyNode>,
  buildingId: string,
  levelNumber: number,
  offsetX: number,
  offsetZ: number,
  name: string,
  height?: number,
  includeDoor = true,
  parcelId?: string,
) {
  const level = LevelNode.parse({
    height,
    level: levelNumber,
    ...(parcelId ? { metadata: { landrushParcelId: parcelId } } : {}),
    name,
    parentId: buildingId,
  })
  nodes[level.id] = level
  addClosedRoom(nodes, level.id, offsetX, offsetZ, 8, 6, name, includeDoor)
}

function addClosedRoom(
  nodes: Record<string, AnyNode>,
  levelId: string,
  offsetX: number,
  offsetZ: number,
  width: number,
  depth: number,
  name: string,
  includeDoor: boolean,
  openingKind: 'door' | 'opening' = 'door',
) {
  const corners = [
    [offsetX, offsetZ],
    [offsetX + width, offsetZ],
    [offsetX + width, offsetZ + depth],
    [offsetX, offsetZ + depth],
  ] as const
  const walls = corners.map((start, index) =>
    WallNode.parse({
      end: corners[(index + 1) % corners.length],
      name: `${name} wall ${String(index + 1)}`,
      parentId: levelId,
      start,
    }),
  )
  const level = nodes[levelId]
  if (level?.type !== 'level') throw new Error(`Missing level ${levelId}`)
  nodes[levelId] = {
    ...level,
    children: [...(level.children ?? []), ...walls.map(({ id }) => id)],
  }
  for (const wall of walls) nodes[wall.id] = wall
  if (!includeDoor) return
  const hostWall = walls[0]!
  const door = DoorNode.parse({ openingKind, parentId: hostWall.id, wallId: hostWall.id })
  nodes[hostWall.id] = { ...hostWall, children: [door.id] }
  nodes[door.id] = door
}
