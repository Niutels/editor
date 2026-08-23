import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeCircleMoveResult,
  createZombieEscapeCollisionHit,
  createZombieEscapeCollisionWorld,
  createZombieEscapeCollisionWorldWithoutObjects,
  createZombieEscapeFlowField,
  createZombieEscapeNavigationMoveResult,
  createZombieEscapeReachableSpawn,
  isZombieEscapeCollisionHitBreakable,
  isZombieEscapeCollisionObjectBreakable,
  moveZombieEscapeCircleWithSlide,
  moveZombieEscapeNavigationAgent,
  resolveZombieEscapeCollisionHitObjectId,
  resolveZombieEscapeFlowDirection,
  resolveZombieEscapeNavigationTargetElevation,
  resolveZombieEscapeReachableSpawn,
  setZombieEscapeFlowFieldWorld,
  sweepZombieEscapeCircleAgainstWorldInVerticalRange,
  sweepZombieEscapeProjectileAgainstWorld,
  updateZombieEscapeFlowTarget,
  zombieEscapeSegmentIsClear,
  zombieEscapeSegmentIsClearInVerticalRange,
} from './zombie-escape-collision-world'

const AGENT_RADIUS = 0.22

describe('Zombie Escape collision world', () => {
  test('builds a stable authority revision independent of source ordering', () => {
    const first = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boxes: [
        {
          breakable: true,
          centerX: 1,
          centerZ: -2,
          halfDepth: 0.4,
          halfWidth: 0.8,
          id: 'box:b',
          rotation: Math.PI / 5,
        },
        {
          centerX: -1,
          centerZ: -2,
          halfDepth: 0.3,
          halfWidth: 0.5,
          id: 'box:a',
          rotation: -Math.PI / 7,
        },
      ],
      circles: [
        { id: 'b', radius: 0.5, x: 2, z: 1 },
        { id: 'a', radius: 0.7, x: -2, z: 1 },
      ],
      playRadius: 8,
      segments: [
        { endX: 0, endZ: 3, halfThickness: 0.09, id: 'wall:b', startX: 0, startZ: 0.45 },
        {
          endX: 0,
          endZ: -0.45,
          halfThickness: 0.09,
          id: 'wall:a',
          startX: 0,
          startZ: -3,
        },
      ],
    })
    const second = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boxes: [...first.boxes].reverse(),
      circles: [...first.circles].reverse(),
      playRadius: 8,
      segments: [...first.segments].reverse(),
    })

    expect(second.revision).toBe(first.revision)
    expect(second.semanticKey).toBe(first.semanticKey)
    expect(second.navigationLayers).toEqual(first.navigationLayers)
    expect(second.broadphase.cellOffsets).toEqual(first.broadphase.cellOffsets)
    expect(second.broadphase.colliderIndices).toEqual(first.broadphase.colliderIndices)
    const field = createZombieEscapeFlowField(first)
    expect(setZombieEscapeFlowFieldWorld(field, second)).toBe(false)
    expect(field.world).toBe(first)
  })

  test('keeps navigation boundary-solid while open combat sweeps use only real colliders', () => {
    const source = {
      agentRadius: AGENT_RADIUS,
      boxes: [
        {
          breakable: true,
          centerX: 8,
          centerZ: 0,
          halfDepth: 0.5,
          halfWidth: 0.5,
          id: 'outside-furniture',
          maximumY: 1,
          minimumY: 0,
          rotation: 0,
        },
      ],
      playRadius: 2,
    } as const
    const navigation = createZombieEscapeCollisionWorld(source)
    const combat = createZombieEscapeCollisionWorld({ ...source, boundaryPolicy: 'none' })
    const hit = createZombieEscapeCollisionHit()
    const candidate = createZombieEscapeCollisionHit()

    expect(navigation.boundaryPolicy).toBe('solid')
    expect(combat.boundaryPolicy).toBe('none')
    expect(combat.semanticKey).not.toBe(navigation.semanticKey)
    expect(combat.revision).not.toBe(navigation.revision)

    sweepZombieEscapeProjectileAgainstWorld(navigation, 5, 0.5, 3, 1, 0, 0, 0.04, hit, candidate)
    expect(hit).toMatchObject({ colliderKind: 'boundary', time: 0 })

    sweepZombieEscapeProjectileAgainstWorld(combat, 5, 0.5, 3, 1, 0, 0, 0.04, hit, candidate)
    expect(hit.colliderKind).toBe('none')
    expect(zombieEscapeSegmentIsClearInVerticalRange(combat, 5, 3, 6, 3, 0.04, 0.4, 0.6)).toBe(true)

    sweepZombieEscapeProjectileAgainstWorld(combat, 6, 0.5, 0.53, 4, 0, 0, 0.04, hit, candidate)
    expect(hit.colliderKind).toBe('box')
    expect(hit.time).toBeGreaterThan(0)

    const afterBreak = createZombieEscapeCollisionWorldWithoutObjects(
      combat,
      new Set(['outside-furniture']),
    )
    const move = createZombieEscapeCircleMoveResult()
    moveZombieEscapeCircleWithSlide(afterBreak, 5, 3, 1, 0, AGENT_RADIUS, hit, move)
    expect(afterBreak.boundaryPolicy).toBe('none')
    expect(afterBreak.broadphase).toMatchObject({ gridHeight: 1, gridWidth: 1 })
    expect(move).toEqual({ collided: false, x: 6, z: 3 })
  })

  test('derives a rectangular open broadphase from every normalized collider primitive', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      boxes: [
        {
          centerX: -50,
          centerZ: 0,
          halfDepth: 0.5,
          halfWidth: 0.5,
          id: 'west-box',
          rotation: 0,
        },
      ],
      broadphaseCellSize: 2,
      circles: [{ id: 'center-circle', radius: 0.5, x: 0, z: 0 }],
      playRadius: 2,
      segments: [
        {
          endX: 51,
          endZ: 0,
          halfThickness: 0.1,
          id: 'east-segment',
          startX: 49,
          startZ: 0,
        },
      ],
    })

    expect(world.broadphase.gridOriginX).toBeLessThanOrEqual(-50.5)
    expect(
      world.broadphase.gridOriginX + world.broadphase.gridWidth * world.broadphase.cellSize,
    ).toBeGreaterThanOrEqual(51.1)
    expect(world.broadphase.gridWidth).toBeGreaterThan(world.broadphase.gridHeight * 20)
    expect(world.broadphase.gridWidth * world.broadphase.gridHeight).toBeLessThan(120)
    expect(new Set(world.broadphase.colliderIndices)).toEqual(new Set([0, 1, 2]))
  })

  test('keeps a standard door aperture walkable and shares one reverse field', () => {
    const world = createDoorWorld()
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()

    expect(zombieEscapeSegmentIsClear(world, -3, 0, 3, 0, AGENT_RADIUS)).toBe(true)
    expect(updateZombieEscapeFlowTarget(field, 3, 0)).toBe(true)
    for (let zombie = 0; zombie < 64; zombie += 1) {
      updateZombieEscapeFlowTarget(field, 3.1, 0.1)
      resolveZombieEscapeFlowDirection(field, -3, zombie * 0.001, 3, 0, sample)
      expect(sample.reachable).toBe(true)
    }
    expect(updateZombieEscapeFlowTarget(field, 3.6, 0)).toBe(true)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3.6, 0, sample)
    expect(sample.reachable).toBe(true)
    expect(updateZombieEscapeFlowTarget(field, -3, 0)).toBe(true)
    resolveZombieEscapeFlowDirection(field, -3, 0, -3, 0, sample)
    expect(sample).toMatchObject({ reachable: true, x: 0, z: 0 })
    expect(field.rebuildCount).toBe(0)
    expect(
      world.navigationLayers.reduce((cells, layer) => cells + layer.occupancy.length, 0),
    ).toBeLessThanOrEqual(230_400)
  })

  test('routes around a solid wall without ever crossing its swept collision volume', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      playRadius: 8,
      segments: [{ endX: 0, endZ: 3, halfThickness: 0.09, id: 'wall', startX: 0, startZ: -3 }],
    })
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()
    const hit = createZombieEscapeCollisionHit()
    const move = createZombieEscapeCircleMoveResult()
    let x = -3
    let z = 0
    updateZombieEscapeFlowTarget(field, 3, 0)

    for (let step = 0; step < 900 && x < 2.7; step += 1) {
      updateZombieEscapeFlowTarget(field, 3.1, 0.1)
      resolveZombieEscapeFlowDirection(field, x, z, 3, 0, sample)
      expect(sample.reachable).toBe(true)
      moveZombieEscapeCircleWithSlide(
        world,
        x,
        z,
        sample.x * 0.08,
        sample.z * 0.08,
        AGENT_RADIUS,
        hit,
        move,
      )
      x = move.x
      z = move.z
      const closestWallZ = Math.max(-3, Math.min(3, z))
      expect(Math.hypot(x, z - closestWallZ)).toBeGreaterThanOrEqual(0.308)
    }

    expect(x).toBeGreaterThan(2.7)
    expect(field.rebuildCount).toBe(1)
    expect(updateZombieEscapeFlowTarget(field, 3.6, 0)).toBe(true)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3.6, 0, sample)
    expect(field.rebuildCount).toBe(2)
  })

  test('a sealed barrier has no through-wall fallback intent', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      playRadius: 5,
      segments: [{ endX: 0, endZ: 5, halfThickness: 0.09, id: 'wall', startX: 0, startZ: -5 }],
    })
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()
    sample.reachable = true
    sample.x = 1
    updateZombieEscapeFlowTarget(field, 2, 0)

    resolveZombieEscapeFlowDirection(field, -2, 0, 2, 0, sample)

    expect(sample).toMatchObject({ reachable: false, x: 0, z: 0 })
  })

  test('retains object ownership across collider pieces and removes one excluded object atomically', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      playRadius: 8,
      segments: [
        {
          endX: 0,
          endZ: 0,
          halfThickness: 0.09,
          id: 'wall-a:piece-0',
          objectId: 'wall-a',
          startX: 0,
          startZ: -3,
        },
        {
          endX: 0,
          endZ: 3,
          halfThickness: 0.09,
          id: 'wall-a:piece-1',
          objectId: 'wall-a',
          startX: 0,
          startZ: 0,
        },
        {
          endX: 2,
          endZ: 3,
          halfThickness: 0.09,
          id: 'wall-b:piece-0',
          objectId: 'wall-b',
          startX: 0,
          startZ: 3,
        },
      ],
    })
    const hit = createZombieEscapeCollisionHit()

    expect(zombieEscapeSegmentIsClear(world, -2, -1, 2, -1, AGENT_RADIUS, hit)).toBe(false)
    expect(resolveZombieEscapeCollisionHitObjectId(world, hit)).toBe('wall-a')

    const filtered = createZombieEscapeCollisionWorldWithoutObjects(world, new Set(['wall-a']))
    expect(filtered.segments.map(({ objectId }) => objectId)).toEqual(['wall-b'])
    expect(zombieEscapeSegmentIsClear(filtered, -2, -1, 2, -1, AGENT_RADIUS)).toBe(true)
    expect(filtered.semanticKey).not.toBe(world.semanticKey)
  })

  test('swept slide cannot tunnel through a thin wall at a large displacement', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      playRadius: 8,
      segments: [{ endX: 0, endZ: 3, halfThickness: 0.04, id: 'thin-wall', startX: 0, startZ: -3 }],
    })
    const hit = createZombieEscapeCollisionHit()
    const move = createZombieEscapeCircleMoveResult()

    moveZombieEscapeCircleWithSlide(world, -2, 0, 4, 1, AGENT_RADIUS, hit, move)

    expect(move.collided).toBe(true)
    expect(move.x).toBeLessThan(-0.25)
    expect(move.z).toBeGreaterThan(0)
  })

  test('keeps authored stair sides solid while connector portals open only at supported landings', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      navigationConnectors: [
        {
          ascendingEnd: true,
          chainId: 'stair-flight',
          chainLowerY: 0,
          chainOrder: 0,
          chainUpperY: 2.5,
          endX: 0,
          endY: 2.5,
          endZ: 1.5,
          halfWidth: 0.5,
          id: 'stair-flight',
          startX: 0,
          startY: 0,
          startZ: -1.5,
        },
      ],
      navigationSupports: [
        {
          elevation: 2.5,
          id: 'upper-landing',
          polygon: [
            { x: -6, z: -6 },
            { x: 6, z: -6 },
            { x: 6, z: 6 },
            { x: -6, z: 6 },
          ],
        },
      ],
      playRadius: 8,
      segments: [
        {
          endX: -0.5,
          endZ: 1.5,
          halfThickness: 0.04,
          id: 'stair-side-left',
          maximumY: 3,
          minimumY: 0,
          startX: -0.5,
          startZ: -1.5,
        },
        {
          endX: 0.5,
          endZ: 1.5,
          halfThickness: 0.04,
          id: 'stair-side-right',
          maximumY: 3,
          minimumY: 0,
          startX: 0.5,
          startZ: -1.5,
        },
      ],
    })
    const hit = createZombieEscapeCollisionHit()
    const result = createZombieEscapeNavigationMoveResult()

    moveZombieEscapeNavigationAgent(world, -2, 0, 0, 4, 0, AGENT_RADIUS, -1, false, hit, result)

    expect(world.navigationConnectors).toHaveLength(1)
    expect(resolveZombieEscapeNavigationTargetElevation(world, 1.2, 0)).toBe(0)
    expect(resolveZombieEscapeNavigationTargetElevation(world, 2.45, 0)).toBe(2.5)
    expect(resolveZombieEscapeNavigationTargetElevation(world, 1.2, 2.5)).toBe(2.5)
    expect(resolveZombieEscapeNavigationTargetElevation(world, 0.05, 2.5)).toBe(0)
    expect(result.collided).toBe(true)
    expect(result.connectorIndex).toBe(-1)
    expect(result.x).toBeLessThan(-0.5 - AGENT_RADIUS)
    expect(result.y).toBe(0)
    const withoutConnector = createZombieEscapeCollisionWorldWithoutObjects(
      world,
      new Set(['stair-flight']),
    )
    expect(withoutConnector.navigationConnectors).toHaveLength(0)
    expect(withoutConnector.boxes).toHaveLength(0)

    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()
    updateZombieEscapeFlowTarget(field, 0, 4, 2.5)
    resolveZombieEscapeFlowDirection(field, 0, -2.5, 0, 4, sample, hit)
    expect(sample.reachable).toBe(true)
    expect(sample.z).toBeGreaterThan(0)
  })

  test('uses exact oriented furniture boxes for navigation, corner sweeps, and vertical shots', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boxes: [
        {
          breakable: true,
          centerX: 0,
          centerZ: 0,
          halfDepth: 0.5,
          halfWidth: 1,
          id: 'table:footprint',
          maximumY: 0.8,
          minimumY: 0,
          objectId: 'table',
          rotation: Math.PI / 4,
        },
      ],
      playRadius: 8,
    })
    const hit = createZombieEscapeCollisionHit()

    expect(zombieEscapeSegmentIsClear(world, -3, 0, 3, 0, AGENT_RADIUS, hit)).toBe(false)
    expect(hit.colliderKind).toBe('box')
    expect(resolveZombieEscapeCollisionHitObjectId(world, hit)).toBe('table')
    expect(isZombieEscapeCollisionHitBreakable(world, hit)).toBe(true)
    expect(isZombieEscapeCollisionObjectBreakable(world, 'table')).toBe(true)

    sweepZombieEscapeCircleAgainstWorldInVerticalRange(world, -2, -2, 4, 4, 0.1, 0.5, 0.5, hit)
    expect(hit.colliderKind).toBe('box')
    expect(hit.time).toBeGreaterThan(0)
    expect(hit.time).toBeLessThan(1)
    expect(Math.hypot(hit.normalX, hit.normalZ)).toBeCloseTo(1, 5)

    expect(zombieEscapeSegmentIsClearInVerticalRange(world, -3, 0, 3, 0, 0.035, 0.7, 0.7)).toBe(
      false,
    )
    expect(zombieEscapeSegmentIsClearInVerticalRange(world, -3, 0, 3, 0, 0.035, 0.9, 0.9)).toBe(
      true,
    )
  })

  test('keys breakability and removes every primitive owned by one furniture object', () => {
    const unbreakable = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boxes: [
        {
          centerX: 0,
          centerZ: 0,
          halfDepth: 0.5,
          halfWidth: 1,
          id: 'cabinet:footprint',
          objectId: 'cabinet',
          rotation: 0,
        },
      ],
      playRadius: 8,
    })
    const breakable = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boxes: [{ ...unbreakable.boxes[0]!, breakable: true }],
      playRadius: 8,
    })

    expect(breakable.semanticKey).not.toBe(unbreakable.semanticKey)
    expect(isZombieEscapeCollisionObjectBreakable(unbreakable, 'cabinet')).toBe(false)
    expect(isZombieEscapeCollisionObjectBreakable(breakable, 'cabinet')).toBe(true)
    const filtered = createZombieEscapeCollisionWorldWithoutObjects(breakable, new Set(['cabinet']))
    expect(filtered.boxes).toHaveLength(0)
    expect(filtered.breakableObjectIds.size).toBe(0)
  })

  test('keeps a 0.9 meter doorway traversable for the maximum catalog radius', () => {
    const rounded = createDoorWorld(0.37, 'round')
    const flat = createDoorWorld(0.37, 'flat')

    expect(zombieEscapeSegmentIsClear(rounded, -3, 0, 3, 0, 0.37)).toBe(false)
    expect(zombieEscapeSegmentIsClear(flat, -3, 0, 3, 0, 0.37)).toBe(true)

    const field = createZombieEscapeFlowField(flat)
    const sample = createFlowSample()
    updateZombieEscapeFlowTarget(field, 3, 0)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3, 0, sample)
    expect(sample.reachable).toBe(true)
  })

  test('filters line of sight by collider height and keys vertical semantics exactly', () => {
    const lowWall = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      playRadius: 8,
      segments: [
        {
          endX: 0,
          endZ: 3,
          halfThickness: 0.09,
          id: 'low-wall',
          maximumY: 1,
          minimumY: 0,
          startX: 0,
          startZ: -3,
        },
      ],
    })
    const tallWall = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      playRadius: 8,
      segments: [{ ...lowWall.segments[0]!, maximumY: 2 }],
    })

    expect(zombieEscapeSegmentIsClearInVerticalRange(lowWall, -2, 0, 2, 0, 0.04, 0.4, 0.8)).toBe(
      false,
    )
    expect(zombieEscapeSegmentIsClearInVerticalRange(lowWall, -2, 0, 2, 0, 0.04, 1.2, 1.8)).toBe(
      true,
    )
    expect(tallWall.semanticKey).not.toBe(lowWall.semanticKey)
    expect(tallWall.revision).not.toBe(lowWall.revision)
  })

  test('intersects projectile footprint and height intervals for every collider primitive', () => {
    const worlds = [
      [
        'box',
        createZombieEscapeCollisionWorld({
          agentRadius: AGENT_RADIUS,
          boxes: [
            {
              centerX: 0,
              centerZ: 0,
              halfDepth: 0.5,
              halfWidth: 0.5,
              id: 'low-box',
              maximumY: 0.8,
              minimumY: 0,
              rotation: 0,
            },
          ],
          playRadius: 8,
        }),
      ],
      [
        'circle',
        createZombieEscapeCollisionWorld({
          agentRadius: AGENT_RADIUS,
          circles: [{ id: 'low-circle', maximumY: 0.8, minimumY: 0, radius: 0.5, x: 0, z: 0 }],
          playRadius: 8,
        }),
      ],
      [
        'segment',
        createZombieEscapeCollisionWorld({
          agentRadius: AGENT_RADIUS,
          playRadius: 8,
          segments: [
            {
              endCap: 'flat',
              endX: 0.5,
              endZ: 0,
              halfThickness: 0.5,
              id: 'low-segment',
              maximumY: 0.8,
              minimumY: 0,
              startCap: 'flat',
              startX: -0.5,
              startZ: 0,
            },
          ],
        }),
      ],
    ] as const

    for (const [kind, world] of worlds) {
      const hit = createZombieEscapeCollisionHit()
      const candidate = createZombieEscapeCollisionHit()

      sweepZombieEscapeProjectileAgainstWorld(
        world,
        0,
        0.9,
        0.7,
        0,
        0,
        -0.375,
        0.035,
        hit,
        candidate,
      )
      expect(hit.colliderKind).toBe('none')

      sweepZombieEscapeProjectileAgainstWorld(
        world,
        0,
        0.7,
        0.7,
        0,
        0,
        -0.375,
        0.035,
        hit,
        candidate,
      )
      expect(hit.colliderKind).toBe(kind)
      expect(hit.normalY).toBe(0)

      sweepZombieEscapeProjectileAgainstWorld(
        world,
        0,
        0.7,
        0.7,
        0,
        0.5,
        -0.375,
        0.035,
        hit,
        candidate,
      )
      expect(hit.colliderKind).toBe('none')

      sweepZombieEscapeProjectileAgainstWorld(world, 0, 1, 0, 0, -1, 0, 0.035, hit, candidate)
      expect(hit.colliderKind).toBe(kind)
      expect(hit.time).toBeCloseTo(0.165, 6)
      expect(hit.normalX).toBe(0)
      expect(hit.normalY).toBe(1)
      expect(hit.normalZ).toBe(0)
    }
  })

  test('keeps a projectile spawned inside a real solid blocked at the point of origin', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boxes: [
        {
          centerX: 0,
          centerZ: 0,
          halfDepth: 0.5,
          halfWidth: 1,
          id: 'semantic-furniture',
          maximumY: 1,
          minimumY: 0,
          rotation: Math.PI / 6,
        },
      ],
      playRadius: 8,
    })
    const hit = createZombieEscapeCollisionHit()
    const candidate = createZombieEscapeCollisionHit()

    sweepZombieEscapeProjectileAgainstWorld(world, 0, 0.5, 0, 3, 0, 0, 0.035, hit, candidate)
    expect(hit.colliderKind).toBe('box')
    expect(hit.time).toBe(0)

    sweepZombieEscapeProjectileAgainstWorld(world, -3, 0.5, 0, 6, 0, 0, 0.035, hit, candidate)
    expect(hit.colliderKind).toBe('box')
    expect(hit.time).toBeGreaterThan(0)

    sweepZombieEscapeProjectileAgainstWorld(world, 0, 2, 0, 0, -3, 0, 0.035, hit, candidate)
    expect(hit.colliderKind).toBe('box')
    expect(hit.normalY).toBe(1)
  })

  test('chooses a deterministic spawn from the target-reachable BFS component', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: 0.37,
      playRadius: 8,
      segments: [
        { endX: 2, endZ: -2, halfThickness: 0.1, id: 'north', startX: -2, startZ: -2 },
        { endX: 2, endZ: 2, halfThickness: 0.1, id: 'east', startX: 2, startZ: -2 },
        { endX: -2, endZ: 2, halfThickness: 0.1, id: 'south', startX: 2, startZ: 2 },
        { endX: -2, endZ: -2, halfThickness: 0.1, id: 'west', startX: -2, startZ: 2 },
      ],
    })
    const field = createZombieEscapeFlowField(world)
    const first = createZombieEscapeReachableSpawn()
    const second = createZombieEscapeReachableSpawn()

    expect(resolveZombieEscapeReachableSpawn(field, 4, 0, 0, 0, 1, first)).toBe(true)
    expect(resolveZombieEscapeReachableSpawn(field, 4, 0, 0, 0, 1, second)).toBe(true)
    expect(second).toEqual(first)
    expect(first.reachable).toBe(true)
    expect(first.x).toBeLessThan(2)
    expect(first.x).toBeGreaterThan(0)

    const sample = createFlowSample()
    resolveZombieEscapeFlowDirection(field, first.x, first.z, 0, 0, sample)
    expect(sample.reachable).toBe(true)
  })
})

function createDoorWorld(agentRadius = AGENT_RADIUS, endCap: 'flat' | 'round' = 'round') {
  return createZombieEscapeCollisionWorld({
    agentRadius,
    playRadius: 8,
    segments: [
      {
        endX: 0,
        endZ: -0.45,
        halfThickness: 0.09,
        id: 'wall:lower',
        endCap,
        startX: 0,
        startCap: endCap,
        startZ: -3,
      },
      {
        endX: 0,
        endZ: 3,
        halfThickness: 0.09,
        id: 'wall:upper',
        endCap,
        startX: 0,
        startCap: endCap,
        startZ: 0.45,
      },
    ],
  })
}

function createFlowSample() {
  return {
    blockingDistance: Number.POSITIVE_INFINITY,
    blockingX: 0,
    blockingZ: 0,
    reachable: false,
    x: 0,
    z: 0,
  }
}
