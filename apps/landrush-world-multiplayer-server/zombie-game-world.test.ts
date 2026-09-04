import { describe, expect, test } from 'bun:test'
import { createLandrushBuildSyncSnapshotNodes } from '@landrush/pascal-host/landrush-build-sync'
import { BuildingNode, DoorNode, LevelNode, WallNode } from '@pascal-app/core'
import { createZombieGameWorldManifest } from '../landrush/scripts/zombie-game-world-source'
import { createZombieGameWorld } from './zombie-game-world'

const manifest = createZombieGameWorldManifest()
const scope = { worldId: manifest.worldId, parcelId: manifest.parcelIds[0]! }
const building = BuildingNode.parse({
  id: 'building_test',
  parentId: null,
  position: [10, 3, -4],
  rotation: [0, Math.PI / 2, 0],
})
const level = LevelNode.parse({ id: 'level_test', parentId: building.id, level: 0, height: 3 })
const wall = WallNode.parse({
  id: 'wall_test',
  parentId: level.id,
  start: [0, 0],
  end: [6, 0],
  height: 3,
  children: ['door_test'],
})
const door = DoorNode.parse({
  id: 'door_test',
  parentId: wall.id,
  wallId: wall.id,
  position: [3, 0, 0],
  width: 1,
  swingAngle: 0,
})
const build = {
  ...scope,
  nodes: createLandrushBuildSyncSnapshotNodes([building, level, wall, door], scope),
}
const base = {
  manifest,
  worldId: manifest.worldId,
  roomId: 'actual-game',
  generation: 1,
  sessionId: 'session',
  night: 1,
}

describe('real Zombie game canonical world', () => {
  test('uses the real island identity, ground origin and map-wide support', () => {
    const world = createZombieGameWorld({ ...base, builds: [] })
    expect(world.origin).toEqual({ x: 0, y: 0.04, z: 0 })
    expect(world.arena.playRadius).toBeGreaterThanOrEqual(
      Math.max(...manifest.surfacePoints.map((point) => Math.hypot(point.x, point.z))),
    )
    expect(world.navigation).not.toBe(world.combat)
    expect(world.weaponPickups).toHaveLength(0)
  })

  test('compiles accepted walls and doors at their actual building transform', () => {
    const world = createZombieGameWorld({ ...base, builds: [build] })
    const actual = world.doors.get(door.id)!
    expect(actual).toBeDefined()
    expect(actual.x).toBeCloseTo(10)
    expect(actual.z).toBeCloseTo(-7)
    expect(actual.y).toBeCloseTo(3)
    expect(actual.open).toBe(false)
    expect(world.nodes[building.id]?.parentId).toBe(manifest.contextSiteId)
  })

  test('uses server-owned door state without changing closed-door topology', () => {
    const closed = createZombieGameWorld({ ...base, builds: [build] })
    const open = createZombieGameWorld({
      ...base,
      builds: [build],
      doorStates: new Map([[door.id, true]]),
    })
    expect(open.worldSignature).toBe(closed.worldSignature)
    expect(open.passableObstacleIds).toEqual([door.id])
    expect(open.doors.get(door.id)?.open).toBe(true)
  })

  test('removes the same construction-hidden palms from server collision and civilian routes', () => {
    const palm = manifest.palms[0]!
    const occupiedBuilding = BuildingNode.parse({
      ...building,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    })
    const occupiedWall = WallNode.parse({
      ...wall,
      children: [],
      start: [palm.position.x - 3, palm.position.z],
      end: [palm.position.x + 3, palm.position.z],
    })
    const occupied = {
      ...scope,
      nodes: createLandrushBuildSyncSnapshotNodes([occupiedBuilding, level, occupiedWall], scope),
    }
    const empty = createZombieGameWorld({ ...base, builds: [] })
    const built = createZombieGameWorld({ ...base, builds: [occupied] })
    expect(empty.navigation.objectCatalog.objectIds).toContain(palm.id)
    expect(built.navigation.objectCatalog.objectIds).not.toContain(palm.id)
    expect(built.combat.objectCatalog.objectIds).not.toContain(palm.id)
  })

  test('refuses unsupported maps, malformed graphs and cross-parcel node collisions', () => {
    expect(() => createZombieGameWorld({ ...base, worldId: 'visitor-world', builds: [] })).toThrow()
    expect(() =>
      createZombieGameWorld({ ...base, builds: [{ ...build, nodes: [null] }] }),
    ).toThrow()
    expect(() => createZombieGameWorld({ ...base, builds: [build, build] })).toThrow()
    const otherScope = { worldId: manifest.worldId, parcelId: manifest.parcelIds[1]! }
    expect(() =>
      createZombieGameWorld({
        ...base,
        builds: [
          build,
          {
            ...otherScope,
            nodes: createLandrushBuildSyncSnapshotNodes([building, level, wall, door], otherScope),
          },
        ],
      }),
    ).toThrow()
  })
})
