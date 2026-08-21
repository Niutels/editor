import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeCircleMoveResult,
  createZombieEscapeCollisionHit,
  createZombieEscapeCollisionWorld,
  createZombieEscapeCollisionWorldWithoutObjects,
  createZombieEscapeFlowField,
  createZombieEscapeReachableSpawn,
  moveZombieEscapeCircleWithSlide,
  resolveZombieEscapeCollisionHitObjectId,
  resolveZombieEscapeFlowDirection,
  resolveZombieEscapeReachableSpawn,
  setZombieEscapeFlowFieldWorld,
  updateZombieEscapeFlowTarget,
  zombieEscapeSegmentIsClear,
  zombieEscapeSegmentIsClearInVerticalRange,
} from './zombie-escape-collision-world'

const AGENT_RADIUS = 0.22

describe('Zombie Escape collision world', () => {
  test('builds a stable authority revision independent of source ordering', () => {
    const first = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
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
      circles: [...first.circles].reverse(),
      playRadius: 8,
      segments: [...first.segments].reverse(),
    })

    expect(second.revision).toBe(first.revision)
    expect(second.semanticKey).toBe(first.semanticKey)
    expect(second.occupancy).toEqual(first.occupancy)
    expect(second.broadphase.cellOffsets).toEqual(first.broadphase.cellOffsets)
    expect(second.broadphase.colliderIndices).toEqual(first.broadphase.colliderIndices)
    const field = createZombieEscapeFlowField(first)
    expect(setZombieEscapeFlowFieldWorld(field, second)).toBe(false)
    expect(field.world).toBe(first)
  })

  test('keeps a standard door aperture walkable and shares one reverse field', () => {
    const world = createDoorWorld()
    const field = createZombieEscapeFlowField(world)
    const sample = { reachable: false, x: 0, z: 0 }

    expect(zombieEscapeSegmentIsClear(world, -3, 0, 3, 0, AGENT_RADIUS)).toBe(true)
    expect(updateZombieEscapeFlowTarget(field, 3, 0)).toBe(true)
    for (let zombie = 0; zombie < 64; zombie += 1) {
      updateZombieEscapeFlowTarget(field, 3.1, 0.1)
      resolveZombieEscapeFlowDirection(field, -3, zombie * 0.001, 3, 0, sample)
      expect(sample.reachable).toBe(true)
    }
    expect(field.rebuildCount).toBe(1)
    expect(world.occupancy.length).toBeLessThanOrEqual(230_400)
  })

  test('routes around a solid wall without ever crossing its swept collision volume', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      playRadius: 8,
      segments: [{ endX: 0, endZ: 3, halfThickness: 0.09, id: 'wall', startX: 0, startZ: -3 }],
    })
    const field = createZombieEscapeFlowField(world)
    const sample = { reachable: false, x: 0, z: 0 }
    const hit = createZombieEscapeCollisionHit()
    const move = createZombieEscapeCircleMoveResult()
    let x = -3
    let z = 0
    updateZombieEscapeFlowTarget(field, 3, 0)

    for (let step = 0; step < 900 && x < 2.7; step += 1) {
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
  })

  test('a sealed barrier has no through-wall fallback intent', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      playRadius: 5,
      segments: [{ endX: 0, endZ: 5, halfThickness: 0.09, id: 'wall', startX: 0, startZ: -5 }],
    })
    const field = createZombieEscapeFlowField(world)
    const sample = { reachable: true, x: 1, z: 0 }
    updateZombieEscapeFlowTarget(field, 2, 0)

    resolveZombieEscapeFlowDirection(field, -2, 0, 2, 0, sample)

    expect(sample).toEqual({ reachable: false, x: 0, z: 0 })
  })

  test('retains object ownership across collider pieces and removes one broken object atomically', () => {
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

  test('keeps a 0.9 meter doorway traversable for the maximum catalog radius', () => {
    const rounded = createDoorWorld(0.37, 'round')
    const flat = createDoorWorld(0.37, 'flat')

    expect(zombieEscapeSegmentIsClear(rounded, -3, 0, 3, 0, 0.37)).toBe(false)
    expect(zombieEscapeSegmentIsClear(flat, -3, 0, 3, 0, 0.37)).toBe(true)

    const field = createZombieEscapeFlowField(flat)
    const sample = { reachable: false, x: 0, z: 0 }
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

    const sample = { reachable: false, x: 0, z: 0 }
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
