import { describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  BuildingNode,
  ColumnNode,
  DoorNode,
  ElevatorNode,
  LevelNode,
  ShelfNode,
  WallNode,
} from '@pascal-app/core'
import {
  createLandrushIslandAiNavigationSnapshot,
  createLandrushIslandRuntimeDoorPassabilityKey,
  createLandrushZombieEscapeCollisionWorld,
  createLandrushZombieEscapeCollisionWorldCompilation,
  createLandrushZombieEscapeCollisionWorldSignature,
  createLandrushZombieEscapeStableClosedDoorPassability,
  resolveLandrushIslandRuntimeDoorPassabilityKey,
  resolveLandrushZombieEscapeLiveOperableDoorIds,
  resolveLandrushZombieEscapeRuntimePassableDoorIds,
} from './landrush-island-ai-navigation-semantics'
import { distanceToLandrushIslandAmbientObstacles } from './landrush-island-ambient-navigation'
import { createLandrushIslandAmbientSemanticNavigationObstacles } from './landrush-island-ambient-navigation-semantics'
import { ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND } from './zombie-escape-collision-world'

function indexNodes(nodes: readonly AnyNode[]) {
  return Object.fromEntries(nodes.map((node) => [node.id, node])) as Record<string, AnyNode>
}

describe('Landrush island shared AI navigation semantics', () => {
  test('compiles exact wall apertures and oriented Pascal objects for both AI consumers', () => {
    const building = BuildingNode.parse({ position: [6, 0, -4], rotation: [0, Math.PI / 4, 0] })
    const level = LevelNode.parse({ level: 0, parentId: building.id })
    const wall = WallNode.parse({
      end: [4, 0],
      parentId: level.id,
      start: [0, 0],
      thickness: 0.18,
    })
    const opening = DoorNode.parse({
      openingKind: 'opening',
      parentId: wall.id,
      position: [2, 0, 0],
      wallId: wall.id,
      width: 1,
    })
    const shelf = ShelfNode.parse({
      depth: 0.4,
      height: 1.6,
      parentId: level.id,
      position: [1, 0, 2],
      rotation: [0, Math.PI / 6, 0],
      width: 1.2,
    })
    const column = ColumnNode.parse({
      crossSection: 'rectangular',
      depth: 0.35,
      parentId: level.id,
      position: [3, 0, 2],
      rotation: Math.PI / 5,
      width: 0.5,
    })
    const elevator = ElevatorNode.parse({
      parentId: building.id,
      position: [4, 0, 2],
      rotation: Math.PI / 7,
      shaftDepth: 2,
      shaftWidth: 1.8,
    })
    const nodes = indexNodes([building, level, wall, opening, shelf, column, elevator])
    const snapshot = createLandrushIslandAiNavigationSnapshot({
      nodes,
      spawn: { x: 2, z: 1 },
    })
    const compilation = createLandrushZombieEscapeCollisionWorldCompilation({
      agentRadius: 0.34,
      nodes,
      playRadius: 20,
      spawn: { x: 2, z: 1 },
    })

    expect(snapshot.segments.filter(({ objectId }) => objectId === wall.id)).toHaveLength(2)
    expect(snapshot.segments.every(({ startCap, endCap }) => startCap || endCap)).toBe(true)
    expect(snapshot.navigationBoxes.map(({ objectId }) => objectId)).toEqual(
      expect.arrayContaining([shelf.id, column.id, elevator.id]),
    )
    expect(snapshot.combatBoxes).toEqual(snapshot.navigationBoxes)
    expect(snapshot.objectSemantics).toEqual(
      [...snapshot.objectSemantics].sort((first, second) =>
        first.objectId.localeCompare(second.objectId),
      ),
    )
    expect(snapshot.objectSemantics).toEqual(
      expect.arrayContaining([
        {
          objectId: shelf.id,
          semanticKind: ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.furniture,
        },
        {
          objectId: column.id,
          semanticKind: ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.other,
        },
      ]),
    )
    expect(compilation.payload.objectSemantics).toEqual(snapshot.objectSemantics)

    const obstacles = createLandrushIslandAmbientSemanticNavigationObstacles({
      agentRadius: 0.3,
      groundY: 0,
      snapshot,
    })
    expect(obstacles.some(({ id }) => id.includes(shelf.id))).toBe(true)
    expect(obstacles.some(({ id }) => id.includes(column.id))).toBe(true)
    expect(obstacles.some(({ id }) => id.includes(elevator.id))).toBe(true)
    expect(obstacles.filter(({ id }) => id.includes(wall.id))).toHaveLength(2)
    expect(
      obstacles
        .filter(({ id }) => !id.includes(wall.id))
        .every(({ points }) => points.length === 4),
    ).toBe(true)
    expect(
      obstacles.filter(({ id }) => id.includes(wall.id)).every(({ points }) => points.length > 4),
    ).toBe(true)
  })

  test('removes descendants from every AI snapshot when any ancestor is hidden', () => {
    const building = BuildingNode.parse({ visible: false })
    const level = LevelNode.parse({ level: 0, parentId: building.id })
    const wall = WallNode.parse({ end: [3, 0], parentId: level.id, start: [0, 0] })
    const shelf = ShelfNode.parse({ parentId: level.id })
    const elevator = ElevatorNode.parse({ parentId: building.id })
    const nodes = indexNodes([building, level, wall, shelf, elevator])

    const hidden = createLandrushIslandAiNavigationSnapshot({
      nodes,
      spawn: { x: 0, z: 0 },
    })
    expect(hidden.navigationBoxes).toEqual([])
    expect(hidden.combatBoxes).toEqual([])
    expect(hidden.navigationConnectors).toEqual([])
    expect(hidden.segments).toEqual([])

    const visible = createLandrushIslandAiNavigationSnapshot({
      nodes: { ...nodes, [building.id]: { ...building, visible: true } },
      spawn: { x: 0, z: 0 },
    })
    expect(visible.semanticKey).not.toBe(hidden.semanticKey)
    expect(visible.navigationBoxes.length).toBeGreaterThan(0)
    expect(visible.segments.length).toBeGreaterThan(0)
  })

  test('shares runtime door thresholds and preserves authoritative round versus flat cap inflation', () => {
    const level = LevelNode.parse({ level: 0 })
    const wall = WallNode.parse({
      end: [4, 0],
      parentId: level.id,
      start: [0, 0],
      thickness: 0.18,
    })
    const door = DoorNode.parse({
      parentId: wall.id,
      position: [2, 0, 0],
      wallId: wall.id,
      width: 1,
    })
    const key = createLandrushIslandRuntimeDoorPassabilityKey({
      irrelevant: {},
      operation: { operationState: 0.85 },
      swing: { swingAngle: Math.PI * 0.38 },
      waiting: { operationState: 0.849, swingAngle: Math.PI * 0.379 },
    })
    expect(resolveLandrushIslandRuntimeDoorPassabilityKey(key)).toEqual({
      operation: true,
      swing: true,
      waiting: false,
    })

    const snapshot = createLandrushIslandAiNavigationSnapshot({
      doorPassability: { [door.id]: true },
      nodes: indexNodes([level, wall, door]),
      spawn: { x: 0, z: 0 },
    })
    const closedSnapshot = createLandrushIslandAiNavigationSnapshot({
      doorPassability: { [door.id]: false },
      nodes: indexNodes([level, wall, door]),
      spawn: { x: 0, z: 0 },
    })
    expect(closedSnapshot.objectSemantics).toContainEqual({
      objectId: door.id,
      semanticKind: ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door,
    })
    const wallObstacles = createLandrushIslandAmbientSemanticNavigationObstacles({
      agentRadius: 0.3,
      groundY: 0,
      snapshot,
    })
      .filter(({ id }) => id.includes(wall.id))
      .sort(
        (first, second) =>
          Math.min(...first.points.map(({ x }) => x)) -
          Math.min(...second.points.map(({ x }) => x)),
      )
    expect(wallObstacles).toHaveLength(2)
    const firstX = wallObstacles[0]!.points.map(({ x }) => x)
    const secondX = wallObstacles[1]!.points.map(({ x }) => x)
    expect(Math.min(...firstX)).toBeCloseTo(-0.39, 6)
    expect(Math.max(...firstX)).toBeCloseTo(1.5, 6)
    expect(Math.min(...secondX)).toBeCloseTo(2.5, 6)
    expect(Math.max(...secondX)).toBeCloseTo(4.39, 6)
    expect(distanceToLandrushIslandAmbientObstacles({ x: 4.2, z: 0 }, wallObstacles)).toBe(0)
    expect(
      distanceToLandrushIslandAmbientObstacles({ x: 4.3, z: 0.3 }, wallObstacles),
    ).toBeGreaterThan(0)
  })

  test('keeps the compiled door topology stable while runtime passability crosses its threshold', () => {
    const level = LevelNode.parse({ level: 0 })
    const wall = WallNode.parse({
      end: [4, 0],
      parentId: level.id,
      start: [0, 0],
      thickness: 0.18,
    })
    const door = DoorNode.parse({
      parentId: wall.id,
      position: [2, 0, 0],
      wallId: wall.id,
      width: 1,
    })
    const nodes = indexNodes([level, wall, door])
    const stableDoorPassability = createLandrushZombieEscapeStableClosedDoorPassability(nodes)
    const resolveRuntimeState = (operationState: number) => {
      const runtimePassability = resolveLandrushIslandRuntimeDoorPassabilityKey(
        createLandrushIslandRuntimeDoorPassabilityKey({
          [door.id]: { operationState },
        }),
      )
      return {
        passableDoorIds: resolveLandrushZombieEscapeRuntimePassableDoorIds(
          nodes,
          runtimePassability,
        ),
        signature: createLandrushZombieEscapeCollisionWorldSignature({
          agentRadius: 0.3,
          doorPassability: stableDoorPassability,
          nodes,
          playRadius: 20,
          spawn: { x: 0, z: 0 },
        }),
      }
    }
    const closed = resolveRuntimeState(0.849)
    const open = resolveRuntimeState(0.85)
    const compilation = createLandrushZombieEscapeCollisionWorldCompilation({
      agentRadius: 0.3,
      doorPassability: stableDoorPassability,
      nodes,
      playRadius: 20,
      spawn: { x: 0, z: 0 },
    })

    expect(stableDoorPassability).toEqual({ [door.id]: false })
    expect(resolveLandrushZombieEscapeLiveOperableDoorIds(nodes)).toEqual([door.id])
    expect(closed.passableDoorIds).toEqual([])
    expect(open.passableDoorIds).toEqual([door.id])
    expect(open.signature).toBe(closed.signature)
    expect(compilation.payload.segments).toContainEqual(
      expect.objectContaining({ breakable: true, objectId: door.id }),
    )
  })

  test('keeps hidden operable doors live while pruning deleted doors and permanent openings', () => {
    const level = LevelNode.parse({ level: 0 })
    const wall = WallNode.parse({
      end: [6, 0],
      parentId: level.id,
      start: [0, 0],
    })
    const visibleDoor = DoorNode.parse({
      parentId: wall.id,
      position: [1.5, 0, 0],
      wallId: wall.id,
    })
    const hiddenDoor = DoorNode.parse({
      parentId: wall.id,
      position: [3, 0, 0],
      visible: false,
      wallId: wall.id,
    })
    const permanentOpening = DoorNode.parse({
      openingKind: 'opening',
      parentId: wall.id,
      position: [4.5, 0, 0],
      wallId: wall.id,
    })
    const nodes = indexNodes([level, wall, visibleDoor, hiddenDoor, permanentOpening])

    expect(resolveLandrushZombieEscapeLiveOperableDoorIds(nodes)).toEqual(
      [visibleDoor.id, hiddenDoor.id].sort((first, second) => first.localeCompare(second)),
    )
    expect(createLandrushZombieEscapeStableClosedDoorPassability(nodes)).toEqual({
      [visibleDoor.id]: false,
    })

    const afterDeletion = { ...nodes }
    delete afterDeletion[hiddenDoor.id]
    expect(resolveLandrushZombieEscapeLiveOperableDoorIds(afterDeletion)).toEqual([visibleDoor.id])
  })

  test('keys the exact surface boundary and selects sparse navigation without a radial boundary', () => {
    const firstSurfaceSupport = {
      boundary: true as const,
      elevation: 0 as const,
      id: 'island-surface',
      polygon: [
        { x: -8, z: -6 },
        { x: 8, z: -6 },
        { x: 8, z: 6 },
        { x: -8, z: 6 },
      ],
    }
    const secondSurfaceSupport = {
      ...firstSurfaceSupport,
      polygon: [...firstSurfaceSupport.polygon.slice(0, 2), { x: 9, z: 6 }, { x: -8, z: 6 }],
    }
    const createSnapshot = (surfaceSupport: typeof firstSurfaceSupport) =>
      createLandrushIslandAiNavigationSnapshot({
        nodes: {},
        spawn: { x: 0, z: 0 },
        surfaceSupport,
      })
    const createWorld = (surfaceSupport: typeof firstSurfaceSupport) =>
      createLandrushZombieEscapeCollisionWorld({
        agentRadius: 0.3,
        nodes: {},
        playRadius: 1,
        spawn: { x: 0, z: 0 },
        surfaceSupport,
      })

    const firstSnapshot = createSnapshot(firstSurfaceSupport)
    const secondSnapshot = createSnapshot(secondSurfaceSupport)
    const firstWorld = createWorld(firstSurfaceSupport)
    const secondWorld = createWorld(secondSurfaceSupport)

    expect(firstSnapshot.navigationSupports).toEqual([firstSurfaceSupport])
    expect(firstSnapshot.semanticKey).not.toBe(secondSnapshot.semanticKey)
    expect(firstWorld.semanticKey).not.toBe(secondWorld.semanticKey)
    expect(firstWorld.navigationMode).toBe('sparse')
    expect(firstWorld.boundaryPolicy).toBe('none')
    expect(firstWorld.gridWidth).toBe(1)
    expect(firstWorld.gridHeight).toBe(1)
  })
})
