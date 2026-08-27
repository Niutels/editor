import { describe, expect, mock, test } from 'bun:test'
import {
  type AnyNode,
  BuildingNode,
  computeStairSegmentChainTransforms,
  DoorNode,
  FenceNode,
  ItemNode,
  LevelNode,
  SlabNode,
  StairNode,
  StairSegmentNode,
  WallNode,
} from '@pascal-app/core'
import { Group, Quaternion, Vector3 } from 'three'
import {
  createLandrushZombieEscapeCollisionBoxes,
  createLandrushZombieEscapeCollisionSegments,
  createLandrushZombieEscapeCollisionSemanticsKey,
  createLandrushZombieEscapeCollisionWorld,
  createLandrushZombieEscapeCollisionWorldResolver,
  createLandrushZombieEscapeCollisionWorldsResolver,
  createLandrushZombieEscapeCombatCollisionBoxes,
  createLandrushZombieEscapeCombatCollisionSemanticsKey,
} from './landrush-island-ai-navigation-semantics'
import {
  createZombieEscapeCollisionHit,
  createZombieEscapeCollisionWorldWithoutObjects,
  createZombieEscapeFlowField,
  createZombieEscapeNavigationMoveResult,
  moveZombieEscapeNavigationAgent,
  resolveZombieEscapeCollisionHitObjectId,
  resolveZombieEscapeFlowDirection,
  sweepZombieEscapeProjectileAgainstWorld,
  updateZombieEscapeFlowTarget,
  zombieEscapeSegmentIsClear,
} from './zombie-escape-collision-world'
import { ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'

describe('Landrush Zombie Escape collision adapter', () => {
  test('emits stable per-floor wall runs with the hosted door removed', () => {
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
    expect(first).toHaveLength(3)
    const groundRuns = first.filter(({ objectId }) => objectId === groundWall.id)
    expect(groundRuns).toHaveLength(2)
    expect(groundRuns[0]?.startX).toBeCloseTo(-1)
    expect(groundRuns[0]?.endX).toBeCloseTo(0.55)
    expect(groundRuns[1]?.startX).toBeCloseTo(1.45)
    expect(groundRuns[1]?.endX).toBeCloseTo(3)
    expect(groundRuns.every(({ startZ, endZ }) => startZ === 1 && endZ === 1)).toBe(true)
    expect(first.some(({ objectId }) => objectId === upperWall.id)).toBe(true)
    expect(first.every(({ breakable }) => breakable === false)).toBe(true)
  })

  test('keeps a closed door solid and opens only its runtime-authorized aperture', () => {
    const level = LevelNode.parse({ level: 0, name: 'Ground' })
    const wall = WallNode.parse({ end: [4, 0], parentId: level.id, start: [0, 0] })
    const fence = FenceNode.parse({ end: [4, 2], parentId: level.id, start: [0, 2] })
    const door = DoorNode.parse({
      parentId: wall.id,
      position: [2, 0, 0],
      wallId: wall.id,
      width: 1,
    })
    const nodes = Object.fromEntries(
      [level, wall, fence, door].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    const closed = createLandrushZombieEscapeCollisionSegments(nodes, { x: 0, z: 0 })
    const open = createLandrushZombieEscapeCollisionSegments(
      nodes,
      { x: 0, z: 0 },
      { [door.id]: true },
    )

    expect(closed).toHaveLength(4)
    expect(closed.filter(({ objectId }) => objectId === wall.id)).toHaveLength(2)
    expect(closed.filter(({ objectId }) => objectId === door.id)).toEqual([
      expect.objectContaining({ breakable: true }),
    ])
    expect(
      closed.filter(({ objectId }) => objectId === wall.id).every(({ breakable }) => !breakable),
    ).toBe(true)
    expect(
      closed.filter(({ objectId }) => objectId === fence.id).every(({ breakable }) => breakable),
    ).toBe(true)
    expect(open).toHaveLength(3)
    expect(open.some(({ objectId }) => objectId === door.id)).toBe(false)

    const closedWorld = createLandrushZombieEscapeCollisionWorld({
      agentRadius: 0.37,
      nodes,
      playRadius: 8,
      spawn: { x: 0, z: 0 },
    })
    expect(closedWorld.breakableObjectIds).toEqual(new Set([door.id, fence.id]))
    const afterDoorBreak = createZombieEscapeCollisionWorldWithoutObjects(
      closedWorld,
      new Set([door.id]),
    )
    expect(afterDoorBreak.segments.some(({ objectId }) => objectId === door.id)).toBe(false)
    expect(afterDoorBreak.segments.filter(({ objectId }) => objectId === wall.id)).toHaveLength(2)
    expect(afterDoorBreak.segments.filter(({ objectId }) => objectId === fence.id)).toHaveLength(1)
    expect(zombieEscapeSegmentIsClear(afterDoorBreak, 2, -1, 2, 1, 0.37)).toBe(true)
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
    expect(wallSegments.every(({ breakable }) => !breakable)).toBe(true)
    expect(fenceSegments.every(({ breakable }) => breakable)).toBe(true)
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

  test('blocks fences on every supported floor they physically cross without creating floating floors', () => {
    const building = BuildingNode.parse({})
    const ground = LevelNode.parse({ height: 3, level: 0, parentId: building.id })
    const upper = LevelNode.parse({ level: 1, parentId: building.id })
    const upperSlab = SlabNode.parse({
      elevation: 0.05,
      parentId: upper.id,
      polygon: [
        [-3, -3],
        [3, -3],
        [3, 3],
        [-3, 3],
      ],
    })
    const fence = FenceNode.parse({
      end: [0, 2],
      height: 4,
      parentId: ground.id,
      start: [0, -2],
    })
    const nodes = Object.fromEntries(
      [building, ground, upper, upperSlab, fence].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>
    const world = createLandrushZombieEscapeCollisionWorld({
      agentRadius: 0.22,
      nodes,
      playRadius: 8,
      spawn: { x: 0, z: 0 },
    })
    const upperElevation = world.navigationLayers.find(({ elevation }) => elevation > 3)!.elevation
    const field = createZombieEscapeFlowField(world)
    const sample = {
      blockingDistance: Number.POSITIVE_INFINITY,
      blockingX: 0,
      blockingZ: 0,
      reachable: false,
      x: 0,
      z: 0,
    }
    const hit = createZombieEscapeCollisionHit()

    updateZombieEscapeFlowTarget(field, 1, 0, 0)
    resolveZombieEscapeFlowDirection(field, -1, 0, 1, 0, sample, hit, 0)
    expect(resolveZombieEscapeCollisionHitObjectId(world, hit)).toBe(fence.id)
    updateZombieEscapeFlowTarget(field, 1, 0, upperElevation)
    resolveZombieEscapeFlowDirection(field, -1, 0, 1, 0, sample, hit, upperElevation)
    expect(resolveZombieEscapeCollisionHitObjectId(world, hit)).toBe(fence.id)

    const withoutUpperSupport = createLandrushZombieEscapeCollisionWorld({
      agentRadius: 0.22,
      nodes: { ...nodes, [upperSlab.id]: { ...upperSlab, visible: false } as AnyNode },
      playRadius: 8,
      spawn: { x: 0, z: 0 },
    })
    expect(withoutUpperSupport.navigationLayers.map(({ elevation }) => elevation)).toEqual([0])
    expect(
      createLandrushZombieEscapeCollisionSemanticsKey({
        ...nodes,
        [upperSlab.id]: { ...upperSlab, elevation: 0.2 } as AnyNode,
      }),
    ).not.toBe(createLandrushZombieEscapeCollisionSemanticsKey(nodes))
  })

  test('derives exact breakable boxes from canonical ground-floor furniture transforms', () => {
    const building = BuildingNode.parse({
      position: [10, 5, 5],
      rotation: [0, Math.PI / 2, 0],
    })
    const level = LevelNode.parse({ baseElevation: 0.2, level: 0, parentId: building.id })
    const table = ItemNode.parse({
      asset: {
        category: 'tables',
        dimensions: [2, 0.8, 1],
        id: 'table-asset',
        name: 'Table',
        src: 'asset://table',
        thumbnail: '',
      },
      parentId: level.id,
      position: [2, 0.3, 1],
      rotation: [0, Math.PI / 4, 0],
      scale: [1.5, 2, 0.5],
    })
    const nodes = Object.fromEntries(
      [building, level, table].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    const boxes = createLandrushZombieEscapeCollisionBoxes(nodes, { x: 10, z: 5 }, 5)

    expect(boxes).toHaveLength(1)
    expect(boxes[0]).toMatchObject({
      breakable: true,
      halfDepth: 0.25,
      halfWidth: 1.5,
      id: `${table.id}:footprint`,
      objectId: table.id,
    })
    expect(boxes[0]?.centerX).toBeCloseTo(1, 6)
    expect(boxes[0]?.centerZ).toBeCloseTo(-2, 6)
    expect(boxes[0]?.minimumY).toBeCloseTo(0.5, 6)
    expect(boxes[0]?.maximumY).toBeCloseTo(2.1, 6)
    expect(boxes[0]?.rotation).toBeCloseTo((Math.PI * 3) / 4, 6)

    const world = createLandrushZombieEscapeCollisionWorld({
      agentRadius: 0.37,
      nodes,
      playRadius: 8,
      spawn: { x: 10, z: 5 },
      verticalOriginY: 5,
    })
    expect(world.boxes).toHaveLength(1)
    expect(world.breakableObjectIds.has(table.id)).toBe(true)
    const semanticKey = createLandrushZombieEscapeCollisionSemanticsKey(nodes)
    expect(
      createLandrushZombieEscapeCollisionSemanticsKey({
        ...nodes,
        [table.id]: { ...table, position: [2.5, 0.3, 1] } as AnyNode,
      }),
    ).not.toBe(semanticKey)
    expect(
      createLandrushZombieEscapeCollisionSemanticsKey({
        ...nodes,
        [table.id]: {
          ...table,
          asset: { ...table.asset, dimensions: [2.5, 0.8, 1] },
        } as AnyNode,
      }),
    ).not.toBe(semanticKey)
  })

  test('uses explicit open-table semantics to remove hollow projectile volume only', () => {
    const level = LevelNode.parse({ level: 0 })
    const table = ItemNode.parse({
      asset: {
        category: 'dining-tables',
        dimensions: [2, 0.8, 1],
        id: 'open-table-asset',
        name: 'Open table',
        src: 'asset://open-table',
        surface: { height: 0.8 },
        tags: ['table', 'dining'],
        thumbnail: '',
      },
      parentId: level.id,
    })
    const nodes = Object.fromEntries([level, table].map((node) => [node.id, node])) as Record<
      string,
      AnyNode
    >
    const world = createLandrushZombieEscapeCollisionWorld({
      agentRadius: 0.22,
      nodes,
      playRadius: 8,
      spawn: { x: 0, z: 0 },
    })
    const [box] = world.boxes

    expect(box?.minimumY).toBeCloseTo(0.72, 6)
    expect(box?.maximumY).toBeCloseTo(0.8, 6)
    expect(zombieEscapeSegmentIsClear(world, -2, 0, 2, 0, 0.1)).toBe(false)

    const hit = createZombieEscapeCollisionHit()
    const candidate = createZombieEscapeCollisionHit()
    sweepZombieEscapeProjectileAgainstWorld(world, -2, 0.5, 0, 4, 0, 0, 0.035, hit, candidate)
    expect(hit.colliderKind).toBe('none')
    sweepZombieEscapeProjectileAgainstWorld(world, -2, 0.78, 0, 4, 0, 0, 0.035, hit, candidate)
    expect(hit.colliderKind).toBe('box')

    const solidNodes = {
      ...nodes,
      [table.id]: {
        ...table,
        asset: { ...table.asset, tags: ['table', 'storage'] },
      } as AnyNode,
    }
    const [solidBox] = createLandrushZombieEscapeCollisionBoxes(solidNodes, { x: 0, z: 0 })
    expect(solidBox?.minimumY).toBe(0)
    expect(createLandrushZombieEscapeCollisionSemanticsKey(solidNodes)).not.toBe(
      createLandrushZombieEscapeCollisionSemanticsKey(nodes),
    )
  })

  test('keeps authored stairs walkable for navigation and height-aware for projectiles', () => {
    const building = BuildingNode.parse({ position: [10, 5, 5], rotation: [0, Math.PI / 2, 0] })
    const level = LevelNode.parse({ baseElevation: 0.2, level: 0, parentId: building.id })
    const segment = StairSegmentNode.parse({
      fillToFloor: true,
      height: 2,
      length: 4,
      stepCount: 4,
      width: 1,
    })
    const stair = StairNode.parse({
      children: [segment.id],
      parentId: level.id,
      position: [2, 0.1, 1],
      rotation: Math.PI / 4,
      stairType: 'straight',
    })
    const nodes = Object.fromEntries(
      [building, level, stair, segment].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    const navigationBoxes = createLandrushZombieEscapeCollisionBoxes(nodes, { x: 10, z: 5 }, 5)
    const boxes = createLandrushZombieEscapeCombatCollisionBoxes(nodes, { x: 10, z: 5 }, 5)

    expect(navigationBoxes).toHaveLength(0)
    expect(boxes).toHaveLength(4)
    expect(boxes.map(({ objectId }) => objectId)).toEqual(Array(4).fill(stair.id))
    expect(boxes.every(({ breakable }) => breakable === false)).toBe(true)
    for (const box of boxes) expect(box.minimumY).toBeCloseTo(0.3, 6)
    for (const [index, box] of boxes.entries()) {
      expect(box.maximumY).toBeCloseTo(0.8 + index * 0.5, 6)
    }
    expect(boxes.every(({ halfDepth }) => halfDepth === 0.5)).toBe(true)
    expect(boxes.every(({ halfWidth }) => halfWidth === 0.5)).toBe(true)
    expect(boxes.every(({ rotation }) => rotation === (Math.PI * 3) / 4)).toBe(true)

    const worlds = createLandrushZombieEscapeCollisionWorldsResolver()({
      agentRadius: 0.22,
      nodes,
      playRadius: 12,
      spawn: { x: 10, z: 5 },
      verticalOriginY: 5,
    })
    const first = boxes[0]!
    const [connector] = worlds.navigation.navigationConnectors
    expect(connector?.startY).toBeCloseTo(0.3, 6)
    expect(connector?.endY).toBeCloseTo(2.3, 6)
    expect(
      zombieEscapeSegmentIsClear(
        worlds.navigation,
        first.centerX - 2,
        first.centerZ,
        first.centerX + 2,
        first.centerZ,
        0.1,
      ),
    ).toBe(true)
    expect(
      zombieEscapeSegmentIsClear(
        worlds.combat,
        first.centerX - 2,
        first.centerZ,
        first.centerX + 2,
        first.centerZ,
        0.1,
      ),
    ).toBe(false)
    expect(worlds.combat.breakableObjectIds.has(stair.id)).toBe(false)

    const baseKey = createLandrushZombieEscapeCombatCollisionSemanticsKey(nodes)
    expect(
      createLandrushZombieEscapeCombatCollisionSemanticsKey({
        ...nodes,
        [segment.id]: { ...segment, length: 5 } as AnyNode,
      }),
    ).not.toBe(baseKey)
  })

  test('keeps parcel-02 firearm sweeps authoritative beyond the navigation arena', () => {
    const fixture = createParcel02CombatExtentFixture()
    const resolveWorlds = createLandrushZombieEscapeCollisionWorldsResolver()
    const input = {
      agentRadius: 0.37,
      nodes: fixture.nodes,
      playRadius: 14,
      spawn: { x: 0, z: 0 },
      verticalOriginY: 0.04,
    }
    const worlds = resolveWorlds(input)
    const cached = resolveWorlds({ ...input, nodes: { ...fixture.nodes } })
    const hit = createZombieEscapeCollisionHit()
    const candidate = createZombieEscapeCollisionHit()

    expect(cached).toBe(worlds)
    expect(worlds.navigation.boundaryPolicy).toBe('solid')
    expect(worlds.combat.boundaryPolicy).toBe('none')
    expect(worlds.combat.semanticKey).not.toBe(worlds.navigation.semanticKey)
    expect(worlds.combat.broadphase.gridWidth * worlds.combat.broadphase.gridHeight).toBeLessThan(
      32,
    )

    const clearSweeps = [
      { displacementX: 0.75, displacementZ: 0, label: 'hall', x: -22.5, z: -12 },
      { displacementX: 2, displacementZ: 0, label: 'dining', x: -22.8, z: -7.8 },
      { displacementX: -2, displacementZ: 0, label: 'kitchen', x: -25, z: -13.4 },
    ] as const
    for (const sweep of clearSweeps) {
      sweepZombieEscapeProjectileAgainstWorld(
        worlds.combat,
        sweep.x,
        1.2,
        sweep.z,
        sweep.displacementX,
        0,
        sweep.displacementZ,
        0.04,
        hit,
        candidate,
      )
      expect(hit.colliderKind, sweep.label).toBe('none')
    }

    sweepZombieEscapeProjectileAgainstWorld(
      worlds.navigation,
      -22.8,
      1.2,
      -7.8,
      2,
      0,
      0,
      0.04,
      hit,
      candidate,
    )
    expect(hit).toMatchObject({ colliderKind: 'boundary', time: 0 })

    sweepZombieEscapeProjectileAgainstWorld(
      worlds.combat,
      -22.8,
      1.2,
      -7.8,
      -2,
      0,
      0,
      0.04,
      hit,
      candidate,
    )
    expect(hit.colliderKind).toBe('segment')
    expect(resolveZombieEscapeCollisionHitObjectId(worlds.combat, hit)).toBe(fixture.wall.id)

    sweepZombieEscapeProjectileAgainstWorld(
      worlds.combat,
      -22.5,
      1.2,
      -12,
      2,
      0,
      0,
      0.04,
      hit,
      candidate,
    )
    expect(hit.colliderKind).toBe('box')
    expect(resolveZombieEscapeCollisionHitObjectId(worlds.combat, hit)).toBe(fixture.stair.id)
  })

  test('routes parcel-02 exterior zombies through the hall and behind-stair bathroom door', () => {
    const fixture = createParcel02ExteriorBathRouteFixture()
    const world = createLandrushZombieEscapeCollisionWorld({
      agentRadius: 0.37,
      doorPassability: {
        [fixture.bathDoor.id]: true,
        [fixture.exteriorDoor.id]: true,
      },
      nodes: fixture.nodes,
      playRadius: 40,
      spawn: { x: 0, z: 0 },
    })

    expect(world.boxes.some(({ objectId }) => objectId === fixture.stair.id)).toBe(false)
    expect(world.segments.some(({ objectId }) => objectId === fixture.bathPartition.id)).toBe(true)
    expect(zombieEscapeSegmentIsClear(world, -25, -14, -23, -14, 0.37)).toBe(true)
    expect(zombieEscapeSegmentIsClear(world, -20, -15.9, -18, -15.9, 0.37)).toBe(true)

    const traversal = traverseGroundNavigationRoute(
      world,
      { x: -26, z: -14 },
      { x: -17.4, z: -14.2 },
      0.37,
    )

    expect(traversal).toMatchObject({ reached: true })
    expect(traversal.crossedExteriorDoor).toBe(true)
    expect(traversal.crossedBathDoor).toBe(true)
  })

  test('distinguishes a forced-ground parcel-02 stair launch from a tread-supported shot', () => {
    const fixture = createParcel02CombatExtentFixture()
    const combatWorld = createLandrushZombieEscapeCollisionWorldsResolver()({
      agentRadius: 0.37,
      nodes: fixture.nodes,
      playRadius: 14,
      spawn: { x: 0, z: 0 },
      verticalOriginY: 0.04,
    }).combat
    const planPoint = { x: -20.5, z: -14 }
    const tread = combatWorld.boxes.find((box) => {
      if (box.objectId !== fixture.stair.id) return false
      const offsetX = planPoint.x - box.centerX
      const offsetZ = planPoint.z - box.centerZ
      const localX = box.cosine * offsetX - box.sine * offsetZ
      const localZ = box.sine * offsetX + box.cosine * offsetZ
      return Math.abs(localX) <= box.halfWidth && Math.abs(localZ) <= box.halfDepth
    })!
    const hit = createZombieEscapeCollisionHit()
    const candidate = createZombieEscapeCollisionHit()

    expect(tread.id).toBe(`${fixture.stair.id}:sseg_house_main:step:5`)
    expect(tread.maximumY).toBeCloseTo(1.018_823_529, 6)

    sweepZombieEscapeProjectileAgainstWorld(
      combatWorld,
      planPoint.x,
      ZOMBIE_ESCAPE_SIMULATION.defaultMuzzleHeight,
      planPoint.z,
      -2,
      0,
      0,
      ZOMBIE_ESCAPE_SIMULATION.projectileRadius,
      hit,
      candidate,
    )
    expect(hit).toMatchObject({ colliderKind: 'box', time: 0 })
    expect(resolveZombieEscapeCollisionHitObjectId(combatWorld, hit)).toBe(fixture.stair.id)

    const supportedShotY = tread.maximumY + ZOMBIE_ESCAPE_SIMULATION.defaultMuzzleHeight
    sweepZombieEscapeProjectileAgainstWorld(
      combatWorld,
      planPoint.x,
      supportedShotY,
      planPoint.z,
      -2,
      0,
      0,
      ZOMBIE_ESCAPE_SIMULATION.projectileRadius,
      hit,
      candidate,
    )
    expect(supportedShotY - ZOMBIE_ESCAPE_SIMULATION.projectileRadius).toBeGreaterThan(
      tread.maximumY,
    )
    expect(hit.colliderKind).toBe('none')
  })

  test.each([{ turnSide: 'left' as const }, { turnSide: 'right' as const }])(
    'matches rendered $turnSide L- and U-chain transforms through building and stair yaw',
    ({ turnSide }) => {
      const building = BuildingNode.parse({
        position: [8.5, 1.2, -4.25],
        rotation: [0, 0.43, 0],
      })
      const level = LevelNode.parse({ baseElevation: 0.65, level: 0, parentId: building.id })
      const segments = [
        StairSegmentNode.parse({ height: 0.9, length: 4.2, stepCount: 1, width: 2 }),
        StairSegmentNode.parse({
          attachmentSide: turnSide,
          height: 0.75,
          length: 3.1,
          stepCount: 1,
          width: 1.6,
        }),
        StairSegmentNode.parse({
          attachmentSide: turnSide,
          height: 0.6,
          length: 2.4,
          stepCount: 1,
          width: 1.2,
        }),
      ]
      const stair = StairNode.parse({
        children: segments.map(({ id }) => id),
        parentId: level.id,
        position: [1.35, 0.15, -0.8],
        rotation: -0.67,
      })
      const nodes = Object.fromEntries(
        [building, level, stair, ...segments].map((node) => [node.id, node]),
      ) as Record<string, AnyNode>
      const spawn = { x: 2.25, z: -1.75 }
      const worlds = createLandrushZombieEscapeCollisionWorldsResolver()({
        agentRadius: 0.37,
        nodes,
        playRadius: 18,
        spawn,
        verticalOriginY: 0.4,
      })
      const rendered = createRenderedStairSegmentTransforms(building, level, stair, segments)

      expect(worlds.navigation.navigationConnectors).toHaveLength(segments.length * 2 - 1)
      expect(worlds.navigation.boxes.filter(({ objectId }) => objectId === stair.id)).toHaveLength(
        0,
      )
      expect(
        worlds.navigation.navigationConnectors.every(
          ({ ascendingEnd, chainLowerY, chainUpperY }) => ascendingEnd && chainUpperY > chainLowerY,
        ),
      ).toBe(true)
      const stairBoxes = worlds.combat.boxes.filter(({ objectId }) => objectId === stair.id)
      expect(stairBoxes).toHaveLength(segments.length)
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index]!
        const box = stairBoxes.find(({ id }) => id.includes(`:${segment.id}:`))
        const expected = rendered[index]!
        expect(box?.centerX).toBeCloseTo(expected.center.x - spawn.x, 6)
        expect(box?.centerZ).toBeCloseTo(expected.center.z - spawn.z, 6)
        expect(Math.sin(box?.rotation ?? 0)).toBeCloseTo(Math.sin(expected.rotation), 6)
        expect(Math.cos(box?.rotation ?? 0)).toBeCloseTo(Math.cos(expected.rotation), 6)
      }
    },
  )

  test('excludes attached, nested, low-profile, hidden, and transient items on every floor', () => {
    const building = BuildingNode.parse({})
    const ground = LevelNode.parse({ level: 0, parentId: building.id })
    const upper = LevelNode.parse({ level: 1, parentId: building.id })
    let itemIndex = 0
    const item = (overrides: Record<string, unknown>) =>
      ItemNode.parse({
        asset: {
          category: 'furniture',
          dimensions: [1, 1, 1],
          id: `asset-${String(itemIndex)}`,
          name: 'Furniture',
          src: 'asset://furniture',
          thumbnail: '',
        },
        id: `item_collision_${String(itemIndex++)}`,
        parentId: ground.id,
        ...overrides,
      })
    const canonical = item({})
    const attached = item({ asset: { ...canonical.asset, attachTo: 'wall' } })
    const nested = item({ parentId: canonical.id })
    const upstairs = item({ parentId: upper.id })
    const rug = item({ asset: { ...canonical.asset, dimensions: [1, 0.05, 1] } })
    const hidden = item({ visible: false })
    const transient = item({ metadata: { isTransient: true } })
    const allNodes = [
      building,
      ground,
      upper,
      canonical,
      attached,
      nested,
      upstairs,
      rug,
      hidden,
      transient,
    ]
    const nodes = Object.fromEntries(allNodes.map((node) => [node.id, node])) as Record<
      string,
      AnyNode
    >

    expect(
      createLandrushZombieEscapeCollisionBoxes(nodes, { x: 0, z: 0 }).map(
        ({ objectId }) => objectId,
      ),
    ).toEqual([canonical.id, upstairs.id])
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
    const unrelatedItem = ItemNode.parse({
      asset: {
        attachTo: 'wall',
        category: 'lighting',
        id: 'observer-only',
        name: 'Wall light',
        src: 'asset://wall-light',
        thumbnail: '',
      },
      parentId: fixture.wall.id,
    })
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
        item_unrelated: ItemNode.parse({
          asset: {
            attachTo: 'wall',
            category: 'lighting',
            id: 'unrelated',
            name: 'Wall light',
            src: 'asset://wall-light',
            thumbnail: '',
          },
          id: 'item_unrelated',
          parentId: fixture.wall.id,
        }),
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

  test('keeps upper-floor geometry in its own navigation layer and retains height-aware combat hits', () => {
    const building = BuildingNode.parse({ name: 'Furnished multi-floor house' })
    const ground = LevelNode.parse({
      baseElevation: 0,
      height: 3,
      level: 0,
      name: 'Ground',
      parentId: building.id,
    })
    const upper = LevelNode.parse({
      baseElevation: 0,
      level: 1,
      name: 'Upper',
      parentId: building.id,
    })
    const upperSlab = SlabNode.parse({
      elevation: 0.05,
      parentId: upper.id,
      polygon: [
        [-8, -4],
        [8, -4],
        [8, 4],
        [-8, 4],
      ],
    })
    const upperWall = WallNode.parse({
      end: [2, 0],
      height: 2,
      parentId: upper.id,
      start: [-2, 0],
    })
    const upperItem = ItemNode.parse({
      asset: {
        category: 'tables',
        dimensions: [1, 1, 1],
        id: 'upper-table',
        name: 'Upper table',
        src: 'asset://upper-table',
        thumbnail: '',
      },
      parentId: upper.id,
      position: [3, 0, 0],
    })
    const upperSegment = StairSegmentNode.parse({ height: 1, length: 2, width: 1 })
    const upperStair = StairNode.parse({
      children: [upperSegment.id],
      parentId: upper.id,
      position: [5, 0, 0],
    })
    const nodes = Object.fromEntries(
      [building, ground, upper, upperSlab, upperWall, upperItem, upperStair, upperSegment].map(
        (node) => [node.id, node],
      ),
    ) as Record<string, AnyNode>
    const worlds = createLandrushZombieEscapeCollisionWorldsResolver()({
      agentRadius: 0.37,
      nodes,
      playRadius: 10,
      spawn: { x: 0, z: 0 },
    })
    const hit = createZombieEscapeCollisionHit()
    const candidate = createZombieEscapeCollisionHit()

    expect(worlds.navigation.segments.some(({ objectId }) => objectId === upperWall.id)).toBe(true)
    expect(worlds.navigation.boxes.some(({ objectId }) => objectId === upperItem.id)).toBe(true)
    expect(worlds.navigation.boxes.some(({ objectId }) => objectId === upperStair.id)).toBe(false)
    expect(worlds.navigation.navigationLayers.map(({ elevation }) => elevation)).toContain(3.05)
    expect(worlds.combat.boxes.some(({ objectId }) => objectId === upperItem.id)).toBe(true)
    expect(worlds.combat.boxes.some(({ objectId }) => objectId === upperStair.id)).toBe(true)

    sweepZombieEscapeProjectileAgainstWorld(
      worlds.combat,
      0,
      3.5,
      -2,
      0,
      0,
      4,
      0.04,
      hit,
      candidate,
    )
    expect(hit.colliderKind).toBe('segment')
    expect(worlds.combat.segments[hit.colliderIndex]?.objectId).toBe(upperWall.id)

    sweepZombieEscapeProjectileAgainstWorld(worlds.combat, 0, 1, -2, 0, 0, 4, 0.04, hit, candidate)
    expect(hit.colliderKind).toBe('none')
  })

  test('rebuilds layered navigation when upper-floor geometry changes', () => {
    const building = BuildingNode.parse({ name: 'Scoped collision house' })
    const ground = LevelNode.parse({ level: 0, parentId: building.id })
    const upper = LevelNode.parse({ baseElevation: 3, level: 1, parentId: building.id })
    const upperWall = WallNode.parse({ end: [2, 0], parentId: upper.id, start: [-2, 0] })
    const nodes = Object.fromEntries(
      [building, ground, upper, upperWall].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>
    const resolveWorlds = createLandrushZombieEscapeCollisionWorldsResolver()
    const input = {
      agentRadius: 0.37,
      nodes,
      playRadius: 10,
      spawn: { x: 0, z: 0 },
    }
    const initial = resolveWorlds(input)
    const identityChurn = resolveWorlds({ ...input, nodes: { ...nodes } })
    const upperChanged = resolveWorlds({
      ...input,
      nodes: {
        ...nodes,
        [upperWall.id]: { ...upperWall, end: [3, 0] } as AnyNode,
      },
    })

    expect(identityChurn).toBe(initial)
    expect(upperChanged.navigation).not.toBe(initial.navigation)
    expect(upperChanged.combat).not.toBe(initial.combat)
  })

  test('rebuilds a cached world for external-circle vertical changes without inventing a floor', () => {
    const resolveWorld = createLandrushZombieEscapeCollisionWorldResolver()
    const input = {
      agentRadius: 0.37,
      circles: [{ id: 'external-zombie', radius: 0.4, x: 1, z: 2 }],
      nodes: {} as Record<string, AnyNode>,
      playRadius: 10,
      spawn: { x: 0, z: 0 },
    }
    const ground = resolveWorld(input)
    const normalizedGround = resolveWorld({
      ...input,
      circles: [{ ...input.circles[0]!, navigationLayerY: 0 }],
    })
    const upper = resolveWorld({
      ...input,
      circles: [{ ...input.circles[0]!, navigationLayerY: 3 }],
    })

    expect(normalizedGround).toBe(ground)
    expect(upper).not.toBe(ground)
    expect(upper.circles[0]?.navigationLayerY).toBe(3)
    expect(upper.navigationLayers.map(({ elevation }) => elevation)).toEqual([0])
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

function createParcel02CombatExtentFixture() {
  const building = BuildingNode.parse({ id: 'building_landrush-island-debug' })
  const ground = LevelNode.parse({
    height: 3,
    id: 'level_landrush-island-debug',
    level: 0,
    parentId: building.id,
  })
  const upper = LevelNode.parse({
    id: 'level_house_upper_storey',
    level: 1,
    parentId: building.id,
  })
  const wall = WallNode.parse({
    end: [-24, -7],
    height: 3,
    id: 'wall_house_g_mid_v_front',
    parentId: ground.id,
    start: [-24, -11],
    thickness: 0.14,
  })
  const stairSegment = StairSegmentNode.parse({
    fillToFloor: true,
    height: 3,
    id: 'sseg_house_main',
    length: 4.1,
    parentId: 'stair_house_main',
    stepCount: 17,
    thickness: 0.22,
    width: 1.15,
  })
  const stair = StairNode.parse({
    children: [stairSegment.id],
    fillToFloor: true,
    fromLevelId: ground.id,
    id: 'stair_house_main',
    parentId: ground.id,
    position: [-20.45, 0, -15.4],
    stairType: 'straight',
    thickness: 0.22,
    toLevelId: upper.id,
    totalRise: 3,
    width: 1.15,
  })
  const diningTable = ItemNode.parse({
    asset: {
      category: 'tables',
      dimensions: [2.5, 0.8, 1],
      id: 'parcel-02-dining-table',
      name: 'Dining Table',
      src: 'asset://parcel-02-dining-table',
      surface: { height: 0.8 },
      tags: ['floor', 'table', 'dining'],
      thumbnail: '',
    },
    id: 'item_g_dining_table',
    parentId: ground.id,
    position: [-21.5, 0, -9],
    rotation: [0, Math.PI / 2, 0],
  })
  const kitchenCounter = ItemNode.parse({
    asset: {
      category: 'storage',
      dimensions: [2, 0.8, 1],
      id: 'parcel-02-kitchen-counter',
      name: 'Kitchen Counter',
      src: 'asset://parcel-02-kitchen-counter',
      surface: { height: 0.75 },
      tags: ['floor', 'large', 'storage', 'kitchen'],
      thumbnail: '',
    },
    id: 'item_g_kitchen_counter',
    parentId: ground.id,
    position: [-26.2, 0, -12],
  })
  const nodes = Object.fromEntries(
    [building, ground, upper, wall, stair, stairSegment, diningTable, kitchenCounter].map(
      (node) => [node.id, node],
    ),
  ) as Record<string, AnyNode>
  return { nodes, stair, wall }
}

function createParcel02ExteriorBathRouteFixture() {
  const building = BuildingNode.parse({
    children: ['level_parcel_02_route_ground'],
    id: 'building_parcel_02_route',
  })
  const ground = LevelNode.parse({
    id: 'level_parcel_02_route_ground',
    level: 0,
    parentId: building.id,
  })
  const exteriorWest = WallNode.parse({
    end: [-24, -7],
    id: 'wall_parcel_02_route_west',
    parentId: ground.id,
    start: [-24, -17],
  })
  const exteriorDoor = DoorNode.parse({
    id: 'door_parcel_02_route_exterior',
    parentId: exteriorWest.id,
    position: [3, 0, 0],
    wallId: exteriorWest.id,
    width: 1.2,
  })
  const exteriorSouth = WallNode.parse({
    end: [-16, -17],
    id: 'wall_parcel_02_route_south',
    parentId: ground.id,
    start: [-24, -17],
  })
  const exteriorEast = WallNode.parse({
    end: [-16, -7],
    id: 'wall_parcel_02_route_east',
    parentId: ground.id,
    start: [-16, -17],
  })
  const exteriorNorth = WallNode.parse({
    end: [-24, -7],
    id: 'wall_parcel_02_route_north',
    parentId: ground.id,
    start: [-16, -7],
  })
  const bathPartition = WallNode.parse({
    end: [-19, -11],
    id: 'wall_parcel_02_route_bath_partition',
    parentId: ground.id,
    start: [-19, -17],
  })
  const bathDoor = DoorNode.parse({
    id: 'door_parcel_02_route_bath',
    parentId: bathPartition.id,
    position: [1.1, 0, 0],
    wallId: bathPartition.id,
    width: 1.2,
  })
  const bathNorth = WallNode.parse({
    end: [-16, -11],
    id: 'wall_parcel_02_route_bath_north',
    parentId: ground.id,
    start: [-19, -11],
  })
  const stairSegment = StairSegmentNode.parse({
    fillToFloor: true,
    height: 3,
    id: 'sseg_parcel_02_route_main',
    length: 4.1,
    parentId: 'stair_parcel_02_route_main',
    stepCount: 17,
    width: 1.15,
  })
  const stair = StairNode.parse({
    children: [stairSegment.id],
    fillToFloor: true,
    id: 'stair_parcel_02_route_main',
    parentId: ground.id,
    position: [-20.45, 0, -15.4],
    width: 1.15,
  })
  const nodes = Object.fromEntries(
    [
      building,
      ground,
      exteriorWest,
      exteriorDoor,
      exteriorSouth,
      exteriorEast,
      exteriorNorth,
      bathPartition,
      bathDoor,
      bathNorth,
      stair,
      stairSegment,
    ].map((node) => [node.id, node]),
  ) as Record<string, AnyNode>
  return { bathDoor, bathPartition, exteriorDoor, nodes, stair }
}

function traverseGroundNavigationRoute(
  world: ReturnType<typeof createLandrushZombieEscapeCollisionWorld>,
  start: Readonly<{ x: number; z: number }>,
  target: Readonly<{ x: number; z: number }>,
  radius: number,
) {
  const field = createZombieEscapeFlowField(world)
  const sample = {
    blockingDistance: Number.POSITIVE_INFINITY,
    blockingX: 0,
    blockingZ: 0,
    reachable: false,
    x: 0,
    z: 0,
  }
  const hit = createZombieEscapeCollisionHit()
  const move = createZombieEscapeNavigationMoveResult()
  let crossedExteriorDoor = false
  let crossedBathDoor = false
  let x = start.x
  let z = start.z
  updateZombieEscapeFlowTarget(field, target.x, target.z, 0)
  for (let step = 0; step < 4_000; step += 1) {
    if (Math.hypot(target.x - x, target.z - z) < 0.45) {
      return { crossedBathDoor, crossedExteriorDoor, reached: true, x, z }
    }
    resolveZombieEscapeFlowDirection(field, x, z, target.x, target.z, sample, hit, 0)
    if (!sample.reachable) break
    const previousX = x
    const previousZ = z
    moveZombieEscapeNavigationAgent(
      world,
      x,
      0,
      z,
      sample.x * 0.06,
      sample.z * 0.06,
      radius,
      -1,
      false,
      hit,
      move,
    )
    x = move.x
    z = move.z
    crossedExteriorDoor ||= segmentCrossesVerticalDoor(
      previousX,
      previousZ,
      x,
      z,
      -24,
      -14.6,
      -13.4,
    )
    crossedBathDoor ||= segmentCrossesVerticalDoor(previousX, previousZ, x, z, -19, -16.5, -15.3)
  }
  return { crossedBathDoor, crossedExteriorDoor, reached: false, x, z }
}

function segmentCrossesVerticalDoor(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  doorX: number,
  minimumZ: number,
  maximumZ: number,
) {
  if ((startX - doorX) * (endX - doorX) > 0 || Math.abs(endX - startX) < 0.000_001) {
    return false
  }
  const amount = (doorX - startX) / (endX - startX)
  const crossingZ = startZ + (endZ - startZ) * amount
  return crossingZ >= minimumZ && crossingZ <= maximumZ
}

function createRenderedStairSegmentTransforms(
  building: ReturnType<typeof BuildingNode.parse>,
  level: ReturnType<typeof LevelNode.parse>,
  stair: ReturnType<typeof StairNode.parse>,
  segments: readonly ReturnType<typeof StairSegmentNode.parse>[],
) {
  const buildingRoot = new Group()
  buildingRoot.position.set(...building.position)
  buildingRoot.rotation.y = building.rotation[1]
  const levelRoot = new Group()
  levelRoot.position.y = level.baseElevation
  const stairRoot = new Group()
  stairRoot.position.set(...stair.position)
  stairRoot.rotation.y = stair.rotation
  buildingRoot.add(levelRoot)
  levelRoot.add(stairRoot)
  const transforms = computeStairSegmentChainTransforms(segments)

  return segments.map((segment, index) => {
    const transform = transforms[index]!
    const segmentRoot = new Group()
    segmentRoot.position.set(...transform.position)
    segmentRoot.rotation.y = transform.rotation
    stairRoot.add(segmentRoot)
    buildingRoot.updateMatrixWorld(true)
    const center = segmentRoot.localToWorld(new Vector3(0, 0, segment.length / 2))
    const forward = new Vector3(0, 0, 1).applyQuaternion(
      segmentRoot.getWorldQuaternion(new Quaternion()),
    )
    stairRoot.remove(segmentRoot)
    return { center, rotation: Math.atan2(forward.x, forward.z) }
  })
}
