import { describe, expect, test } from 'bun:test'
import { type AnyNode, BuildingNode, CeilingNode, LevelNode, WallNode } from '@pascal-app/core'
import { findLandrushBuildingFloorInteriorRegion } from './landrush-building-floor-visibility'
import { resolveZombieEscapeWeaponPickupPlacements } from './zombie-escape-weapon-placement'

describe('Zombie Escape weapon placement', () => {
  test('deterministically places at most five weapons with one ground-floor pickup per building', () => {
    const nodes = {} as Record<string, AnyNode>
    for (let index = 0; index < 7; index += 1) {
      addClosedBuilding(nodes, index * 12, 0, `Building ${String(index + 1)}`)
    }
    const reversedNodes = Object.fromEntries(Object.entries(nodes).reverse()) as Record<
      string,
      AnyNode
    >

    const first = resolveZombieEscapeWeaponPickupPlacements(nodes)
    const second = resolveZombieEscapeWeaponPickupPlacements(reversedNodes)

    expect(first).toEqual(second)
    expect(first).toHaveLength(4)
    expect(new Set(first.map(({ scopeId }) => scopeId)).size).toBe(first.length)
    expect(first.map(({ weaponIndex }) => weaponIndex)).toEqual([1, 2, 3, 4])
    expect(first.every(({ y }) => y === 0)).toBe(true)
  })

  test('puts the first paid weapon in the first eligible building', () => {
    const nodes = {} as Record<string, AnyNode>
    addClosedBuilding(nodes, 0, 0, 'Only building')

    expect(resolveZombieEscapeWeaponPickupPlacements(nodes)).toEqual([
      expect.objectContaining({ weaponIndex: 1, y: 0 }),
    ])
  })

  test('uses level zero instead of a basement when both exist', () => {
    const nodes = {} as Record<string, AnyNode>
    const building = BuildingNode.parse({ name: 'Basement house' })
    nodes[building.id] = building
    addClosedLevel(nodes, building.id, -1, 40, 40, 'Basement', 4)
    addClosedLevel(nodes, building.id, 0, 3, 5, 'Ground')

    const [placement] = resolveZombieEscapeWeaponPickupPlacements(nodes)

    expect(placement).toBeDefined()
    expect(placement!.x).toBeGreaterThan(3)
    expect(placement!.x).toBeLessThan(11)
    expect(placement!.z).toBeGreaterThan(5)
    expect(placement!.z).toBeLessThan(11)
    expect(placement!.y).toBe(4)
  })

  test('chooses a valid interior point outside ceiling holes', () => {
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

    const [placement] = resolveZombieEscapeWeaponPickupPlacements(nodes)

    expect(placement).toBeDefined()
    expect(findLandrushBuildingFloorInteriorRegion(placement!, [region])).not.toBeNull()
  })
})

function addClosedBuilding(
  nodes: Record<string, AnyNode>,
  offsetX: number,
  offsetZ: number,
  name: string,
) {
  const building = BuildingNode.parse({ name })
  nodes[building.id] = building
  addClosedLevel(nodes, building.id, 0, offsetX, offsetZ, `${name} ground`)
}

function addClosedLevel(
  nodes: Record<string, AnyNode>,
  buildingId: string,
  levelNumber: number,
  offsetX: number,
  offsetZ: number,
  name: string,
  height?: number,
) {
  const level = LevelNode.parse({ height, level: levelNumber, name, parentId: buildingId })
  const corners = [
    [offsetX, offsetZ],
    [offsetX + 8, offsetZ],
    [offsetX + 8, offsetZ + 6],
    [offsetX, offsetZ + 6],
  ] as const
  const walls = corners.map((start, index) =>
    WallNode.parse({
      end: corners[(index + 1) % corners.length],
      name: `${name} wall ${String(index + 1)}`,
      parentId: level.id,
      start,
    }),
  )
  nodes[level.id] = { ...level, children: walls.map(({ id }) => id) }
  for (const wall of walls) nodes[wall.id] = wall
}
