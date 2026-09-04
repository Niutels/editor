import { describe, expect, test } from 'bun:test'
import {
  isLandrushIslandAmbientPointOnRoad,
  isLandrushIslandAmbientPointWalkable,
  isLandrushIslandAmbientSegmentPassable,
  type LandrushIslandAmbientNavigationWorld,
} from '@landrush/runtime/landrush-island-ambient-navigation'
import {
  advanceLandrushIslandAmbientNpcMotion,
  createLandrushIslandAmbientNpcJourneyPlanner,
  createLandrushIslandAmbientNpcMotionState,
  createLandrushIslandAmbientNpcNeighborIndex,
  reconcileLandrushIslandAmbientNpcMotionStateForWorld,
} from '@landrush/runtime/landrush-island-ambient-npc-motion'
import type { LandrushRoadSegment } from '@/components/landrush/types'

const world: LandrushIslandAmbientNavigationWorld = {
  obstacles: [
    {
      id: 'house',
      points: [
        { x: -2, z: -4 },
        { x: 2, z: -4 },
        { x: 2, z: 4 },
        { x: -2, z: 4 },
      ],
    },
  ],
  roads: [
    road('cross-x', [
      [-17, 0],
      [17, 0],
    ]),
    road('cross-z', [
      [0, -17],
      [0, 17],
    ]),
  ],
  surfacePoints: [
    { x: -18, z: -18 },
    { x: 18, z: -18 },
    { x: 18, z: 18 },
    { x: -18, z: 18 },
  ],
}

describe('Landrush island ambient NPC motion', () => {
  test('starts idle, then alternates locomotion with real arrival idles on grass', () => {
    const state = createLandrushIslandAmbientNpcMotionState(3, world)
    expect(state.phase).toBe('idle')
    expect(state.idleSeconds).toBeGreaterThanOrEqual(1.8)
    expect(isLandrushIslandAmbientPointOnRoad(state.position, world.roads)).toBe(false)

    advanceLandrushIslandAmbientNpcMotion(state, 1, world)
    expect(state.phase).toBe('idle')

    let sawLocomotion = false
    let sawArrivalIdle = false
    let sawOffRoadLocomotion = false
    for (let frame = 0; frame < 60 * 180; frame += 1) {
      const previous = { ...state.position }
      advanceLandrushIslandAmbientNpcMotion(state, 1 / 60, world)
      expect(isLandrushIslandAmbientPointWalkable(world, state.position)).toBe(true)
      expect(isLandrushIslandAmbientSegmentPassable(world, previous, state.position)).toBe(true)
      if (state.phase !== 'idle') {
        sawLocomotion = true
        if (!isLandrushIslandAmbientPointOnRoad(state.position, world.roads)) {
          sawOffRoadLocomotion = true
        }
      } else if (sawLocomotion && state.destinationSequence > 0) {
        sawArrivalIdle = true
      }
    }

    expect(sawLocomotion).toBe(true)
    expect(sawArrivalIdle).toBe(true)
    expect(sawOffRoadLocomotion).toBe(true)
  })

  test('is deterministic across 30 and 60 fps stepping', () => {
    const sixtyFps = createLandrushIslandAmbientNpcMotionState(7, world)
    const thirtyFps = createLandrushIslandAmbientNpcMotionState(7, world)

    for (let frame = 0; frame < 60 * 45; frame += 1) {
      advanceLandrushIslandAmbientNpcMotion(sixtyFps, 1 / 60, world)
    }
    for (let frame = 0; frame < 30 * 45; frame += 1) {
      advanceLandrushIslandAmbientNpcMotion(thirtyFps, 1 / 30, world)
    }

    expect(sixtyFps.phase).toBe(thirtyFps.phase)
    expect(sixtyFps.destinationSequence).toBe(thirtyFps.destinationSequence)
    expect(sixtyFps.position.x).toBeCloseTo(thirtyFps.position.x, 5)
    expect(sixtyFps.position.z).toBeCloseTo(thirtyFps.position.z, 5)
    expect(sixtyFps.idleSeconds).toBeCloseTo(thirtyFps.idleSeconds, 5)
  })

  test('keeps all ten NPC capsules separated while they share the surface', () => {
    const states = Array.from({ length: 10 }, (_, index) =>
      createLandrushIslandAmbientNpcMotionState(index, world),
    )
    const neighborIndex = createLandrushIslandAmbientNpcNeighborIndex(world, states.length)
    const neighborQueries = states.map((state) => neighborIndex.createQuery(state.seed))
    for (const state of states) neighborIndex.set(state.seed, state.position)

    for (let frame = 0; frame < 60 * 120; frame += 1) {
      for (let index = 0; index < states.length; index += 1) {
        const state = states[index]!
        advanceLandrushIslandAmbientNpcMotion(state, 1 / 60, world, neighborQueries[index])
        neighborIndex.set(state.seed, state.position)
      }
      for (let firstIndex = 0; firstIndex < states.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < states.length; secondIndex += 1) {
          const first = states[firstIndex]!
          const second = states[secondIndex]!
          expect(
            Math.hypot(first.position.x - second.position.x, first.position.z - second.position.z),
          ).toBeGreaterThanOrEqual(0.72 - 0.000_01)
        }
      }
    }
  })

  test('updates a fixed spatial neighbor index across cells and removal', () => {
    const neighborIndex = createLandrushIslandAmbientNpcNeighborIndex(world, 32)
    const groundskeeperQuery = neighborIndex.createQuery('groundskeeper')
    neighborIndex.set('groundskeeper', { x: -12, z: -12 })
    neighborIndex.set('visitor', { x: -11.29, z: -12 })
    for (let index = 0; index < 30; index += 1) {
      neighborIndex.set(`far-${index}`, { x: 6 + (index % 5), z: 6 + Math.floor(index / 5) })
    }

    expect(groundskeeperQuery.positionHasClearance({ x: -12, z: -12 })).toBe(false)
    neighborIndex.set('visitor', { x: 12, z: 12 })
    expect(groundskeeperQuery.positionHasClearance({ x: -12, z: -12 })).toBe(true)
    neighborIndex.set('visitor', { x: -12.1, z: -12.1 })
    expect(groundskeeperQuery.positionHasClearance({ x: -12, z: -12 })).toBe(false)
    neighborIndex.delete('visitor')
    expect(groundskeeperQuery.positionHasClearance({ x: -12, z: -12 })).toBe(true)
  })

  test('reuses the motion position object during steady locomotion', () => {
    const state = createLandrushIslandAmbientNpcMotionState(0, world)
    state.position = { x: -12, z: -12 }
    state.path = [{ x: -10, z: -12 }]
    state.pathIndex = 0
    state.phase = 'walk'
    state.speedMetersPerSecond = 1.25
    const position = state.position

    for (let frame = 0; frame < 60; frame += 1) {
      advanceLandrushIslandAmbientNpcMotion(state, 1 / 60, world)
      expect(state.position).toBe(position)
    }
    expect(state.position.x).toBeGreaterThan(-12)
  })

  test('shares one strict per-frame planning budget fairly across ten NPCs', () => {
    const states = Array.from({ length: 10 }, (_, index) =>
      createLandrushIslandAmbientNpcMotionState(index, world),
    )
    const planner = createLandrushIslandAmbientNpcJourneyPlanner(world)
    for (const state of states) {
      state.idleSeconds = 0
      advanceLandrushIslandAmbientNpcMotion(state, 1 / 60, world, [], planner)
    }
    expect(planner.getSnapshot().pendingCount).toBe(10)

    for (let turn = 0; turn < states.length; turn += 1) {
      const result = planner.advance(1)
      expect(result.operations).toBeLessThanOrEqual(1)
    }
    const afterFirstRound = planner.getSnapshot()
    expect(afterFirstRound.pendingCount).toBe(10)
    expect(afterFirstRound.jobs.every((job) => job.operations === 1)).toBe(true)

    let maximumOperations = 0
    for (let frame = 0; frame < 10_000 && planner.getSnapshot().pendingCount > 0; frame += 1) {
      const result = planner.advance(64)
      maximumOperations = Math.max(maximumOperations, result.operations)
      expect(result.operations).toBeLessThanOrEqual(64)
    }
    expect(planner.getSnapshot().pendingCount).toBe(0)
    expect(maximumOperations).toBeLessThanOrEqual(64)
    expect(states.some((state) => state.phase !== 'idle')).toBe(true)
  })

  test('ignores stale planning work after motion state changes', () => {
    const state = createLandrushIslandAmbientNpcMotionState(2, world)
    const planner = createLandrushIslandAmbientNpcJourneyPlanner(world)
    state.idleSeconds = 0
    advanceLandrushIslandAmbientNpcMotion(state, 1 / 60, world, [], planner)
    expect(planner.getSnapshot().pendingCount).toBe(1)

    state.destinationSequence += 1
    const result = planner.advance(64)
    expect(result.pendingCount).toBe(0)
    expect(state.phase).toBe('idle')
    expect(state.path).toEqual([])
  })

  test('reuses one planner-owned per-frame result through completion', () => {
    const state = createLandrushIslandAmbientNpcMotionState(4, world)
    const planner = createLandrushIslandAmbientNpcJourneyPlanner(world)
    state.idleSeconds = 0
    advanceLandrushIslandAmbientNpcMotion(state, 1 / 60, world, [], planner)

    const result = planner.advance(1)
    expect(result.pendingCount).toBe(1)
    for (let frame = 0; frame < 10_000 && result.pendingCount > 0; frame += 1) {
      expect(planner.advance(16)).toBe(result)
      expect(result.operations).toBeLessThanOrEqual(16)
    }
    expect(result.pendingCount).toBe(0)
    expect(state.phase).not.toBe('idle')
  })

  test('preserves a valid position across topology changes and respawns only invalid positions', () => {
    const state = createLandrushIslandAmbientNpcMotionState(5, world)
    const original = { ...state.position }
    state.phase = 'walk'
    state.path = [{ x: original.x + 1, z: original.z }]
    const reconciled = reconcileLandrushIslandAmbientNpcMotionStateForWorld(state, 5, world)
    expect(reconciled).toBe(state)
    expect(reconciled.position).toEqual(original)
    expect(reconciled.phase).toBe('idle')
    expect(reconciled.path).toEqual([])

    state.position = { x: 0, z: 0 }
    const respawned = reconcileLandrushIslandAmbientNpcMotionStateForWorld(state, 5, world)
    expect(respawned).not.toBe(state)
    expect(isLandrushIslandAmbientPointWalkable(world, respawned.position)).toBe(true)
  })
})

function road(id: string, points: readonly (readonly [number, number])[]): LandrushRoadSegment {
  return {
    connectsParcelIds: [],
    fromNodeId: `${id}-from`,
    id,
    kind: 'spine',
    points: points.map(([x, z]) => ({ x, z })),
    r3fPoints: points.map(([x, z]) => [x, 0, z]),
    toNodeId: `${id}-to`,
    width: 2,
  }
}
