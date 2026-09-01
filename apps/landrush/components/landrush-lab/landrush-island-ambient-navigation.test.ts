import { describe, expect, test } from 'bun:test'
import type { LandrushPoint2, LandrushRoadSegment } from '@/components/landrush/types'
import {
  advanceLandrushIslandAmbientWalkablePathSearch,
  createLandrushIslandAmbientNavigationWorld,
  createLandrushIslandAmbientWalkablePathSearch,
  distanceToLandrushIslandAmbientObstacles,
  findLandrushIslandAmbientWalkablePath,
  isLandrushIslandAmbientPointOnRoad,
  isLandrushIslandAmbientPointWalkable,
  isLandrushIslandAmbientSegmentPassable,
  type LandrushIslandAmbientNavigationWorld,
  resolveLandrushIslandAmbientDestination,
} from './landrush-island-ambient-navigation'

const world: LandrushIslandAmbientNavigationWorld = {
  obstacles: [
    {
      id: 'building',
      points: [
        { x: -1, z: -3 },
        { x: 1, z: -3 },
        { x: 1, z: 3 },
        { x: -1, z: 3 },
      ],
    },
  ],
  roads: [
    road('main', [
      [-9, 0],
      [9, 0],
    ]),
  ],
  surfacePoints: [
    { x: -10, z: -10 },
    { x: 10, z: -10 },
    { x: 10, z: 10 },
    { x: -10, z: 10 },
  ],
}

const notchedWorld: LandrushIslandAmbientNavigationWorld = {
  obstacles: [],
  roads: [],
  surfacePoints: [
    { x: -16, z: -16 },
    { x: 16, z: -16 },
    { x: 16, z: 16 },
    { x: 10, z: 16 },
    { x: 10, z: 10 },
    { x: 8, z: 10 },
    { x: 8, z: 16 },
    { x: -16, z: 16 },
  ],
}

describe('Landrush island ambient navigation', () => {
  test('uses the walkable surface visibility graph to detour around collision geometry', () => {
    const path = findLandrushIslandAmbientWalkablePath(world, { x: -7, z: 0 }, { x: 7, z: 0 })

    expect(path.length).toBeGreaterThan(2)
    expect(path.some((point) => Math.abs(point.z) > 3)).toBe(true)
    expect(path.every((point) => isLandrushIslandAmbientPointWalkable(world, point))).toBe(true)
    for (let index = 1; index < path.length; index += 1) {
      expect(isLandrushIslandAmbientSegmentPassable(world, path[index - 1]!, path[index]!)).toBe(
        true,
      )
    }
  })

  test('deterministically chooses grass destinations away from road centers', () => {
    const first = resolveLandrushIslandAmbientDestination(world, 'npc-4', 8, 'grass')
    const repeated = resolveLandrushIslandAmbientDestination(world, 'npc-4', 8, 'grass')

    expect(first).toEqual(repeated)
    expect(first).not.toBeNull()
    expect(isLandrushIslandAmbientPointWalkable(world, first!)).toBe(true)
    expect(isLandrushIslandAmbientPointOnRoad(first!, world.roads)).toBe(false)
  })

  test('rejects direct motion through scene obstacles', () => {
    expect(isLandrushIslandAmbientSegmentPassable(world, { x: -7, z: 0 }, { x: 7, z: 0 })).toBe(
      false,
    )
    expect(isLandrushIslandAmbientPointWalkable(world, { x: 0, z: 0 })).toBe(false)
  })

  test('keeps indexed point, segment, distance, destination, and path results in parity', () => {
    const indexedWorld = createLandrushIslandAmbientNavigationWorld(world)
    const points = [
      { x: -9, z: -9 },
      { x: 0, z: 0 },
      { x: -1, z: 3 },
      { x: 4, z: 6 },
      { x: 10, z: 0 },
    ]
    const segments = [
      [
        { x: -7, z: 0 },
        { x: 7, z: 0 },
      ],
      [
        { x: -7, z: 6 },
        { x: 7, z: 6 },
      ],
      [
        { x: -9, z: -9 },
        { x: 9, z: 9 },
      ],
      [
        { x: -9, z: 9 },
        { x: 9, z: 9 },
      ],
    ] as const

    expect(Object.isFrozen(indexedWorld)).toBe(true)
    expect(Object.isFrozen(indexedWorld.obstacles)).toBe(true)
    expect(Object.isFrozen(indexedWorld.obstacles[0]?.points)).toBe(true)
    for (const point of points) {
      expect(isLandrushIslandAmbientPointWalkable(indexedWorld, point)).toBe(
        isLandrushIslandAmbientPointWalkable(world, point),
      )
      expect(distanceToLandrushIslandAmbientObstacles(point, indexedWorld.obstacles)).toBe(
        distanceToLandrushIslandAmbientObstacles(point, world.obstacles),
      )
    }
    for (const [start, end] of segments) {
      expect(isLandrushIslandAmbientSegmentPassable(indexedWorld, start, end)).toBe(
        isLandrushIslandAmbientSegmentPassable(world, start, end),
      )
    }
    expect(resolveLandrushIslandAmbientDestination(indexedWorld, 'npc-4', 8, 'grass')).toEqual(
      resolveLandrushIslandAmbientDestination(world, 'npc-4', 8, 'grass'),
    )
    expect(
      findLandrushIslandAmbientWalkablePath(indexedWorld, { x: -7, z: 0 }, { x: 7, z: 0 }),
    ).toEqual(findLandrushIslandAmbientWalkablePath(world, { x: -7, z: 0 }, { x: 7, z: 0 }))
  })

  test('preserves shoreline rejection when a segment crosses an edge on a grid boundary', () => {
    const indexedWorld = createLandrushIslandAmbientNavigationWorld(notchedWorld)
    const start = { x: -15, z: 12 }
    const end = { x: 15, z: 12 }

    expect(isLandrushIslandAmbientSegmentPassable(notchedWorld, start, end)).toBe(false)
    expect(isLandrushIslandAmbientSegmentPassable(indexedWorld, start, end)).toBe(false)
  })

  test('keeps horizontal, vertical, and diagonal grid clipping in deterministic parity', () => {
    const indexedWorld = createLandrushIslandAmbientNavigationWorld(world)
    const segments: Array<readonly [LandrushPoint2, LandrushPoint2]> = []
    for (const offset of [-9, -6, -3, 0, 3, 6, 9]) {
      segments.push(
        [
          { x: -9, z: offset },
          { x: 9, z: offset },
        ],
        [
          { x: offset, z: -9 },
          { x: offset, z: 9 },
        ],
        [
          { x: -9, z: offset },
          { x: 9, z: -offset },
        ],
        [
          { x: offset, z: -9 },
          { x: -offset, z: 9 },
        ],
      )
    }

    for (const [start, end] of segments) {
      expect(isLandrushIslandAmbientSegmentPassable(indexedWorld, start, end)).toBe(
        isLandrushIslandAmbientSegmentPassable(world, start, end),
      )
    }
  })

  test('compiles candidates once, reuses static edges, and rebuilds for a new world', () => {
    const observations: Array<{ candidateCount: number; kind: string; totalCount: number }> = []
    const observeSpatialQuery = (observation: {
      candidateCount: number
      kind: string
      totalCount: number
    }) => observations.push(observation)
    const indexedWorld = createLandrushIslandAmbientNavigationWorld(world, {
      observeSpatialQuery,
    })

    expect(observations.filter((observation) => observation.kind === 'graph-build')).toHaveLength(1)
    const firstPath = findLandrushIslandAmbientWalkablePath(
      indexedWorld,
      { x: -7, z: 0 },
      { x: 7, z: 0 },
    )
    const firstQuery = observations
      .filter((observation) => observation.kind === 'graph-query')
      .at(-1)
    expect(firstPath.length).toBeGreaterThan(2)
    expect(firstQuery?.candidateCount).toBeGreaterThan(0)
    expect(firstQuery?.totalCount).toBeGreaterThanOrEqual(firstQuery?.candidateCount ?? 0)

    for (let repeat = 0; repeat < 6; repeat += 1) {
      expect(
        findLandrushIslandAmbientWalkablePath(indexedWorld, { x: -7, z: 0 }, { x: 7, z: 0 }),
      ).toEqual(firstPath)
    }
    const repeatedQueries = observations
      .filter((observation) => observation.kind === 'graph-query')
      .slice(1)
    expect(repeatedQueries).toHaveLength(6)
    expect(
      repeatedQueries.every(
        (observation) =>
          observation.candidateCount === 0 && observation.totalCount === firstQuery?.totalCount,
      ),
    ).toBe(true)
    expect(observations.filter((observation) => observation.kind === 'graph-build')).toHaveLength(1)

    const rebuiltWorld = createLandrushIslandAmbientNavigationWorld(world, {
      observeSpatialQuery,
    })
    expect(observations.filter((observation) => observation.kind === 'graph-build')).toHaveLength(2)
    findLandrushIslandAmbientWalkablePath(rebuiltWorld, { x: -7, z: 0 }, { x: 7, z: 0 })
    expect(
      observations.filter((observation) => observation.kind === 'graph-query').at(-1)
        ?.candidateCount,
    ).toBeGreaterThan(0)
  })

  test('deterministically prunes a dense 121-obstacle world before exact predicates', () => {
    const observations: Array<{ candidateCount: number; kind: string; totalCount: number }> = []
    const denseSource: LandrushIslandAmbientNavigationWorld = {
      obstacles: createDenseObstacles(),
      roads: [],
      surfacePoints: [
        { x: -70, z: -70 },
        { x: 70, z: -70 },
        { x: 70, z: 70 },
        { x: -70, z: 70 },
      ],
    }
    const denseWorld = createLandrushIslandAmbientNavigationWorld(denseSource, {
      observeSpatialQuery: (observation) => observations.push(observation),
    })

    observations.length = 0
    expect(isLandrushIslandAmbientPointWalkable(denseWorld, { x: 5, z: 5 })).toBe(true)
    expect(observations).toEqual([{ candidateCount: 1, kind: 'obstacle-point', totalCount: 121 }])

    observations.length = 0
    expect(
      isLandrushIslandAmbientSegmentPassable(denseWorld, { x: -58, z: 5 }, { x: 58, z: 5 }),
    ).toBe(true)
    expect(observations.find((observation) => observation.kind === 'obstacle-segment')).toEqual({
      candidateCount: 11,
      kind: 'obstacle-segment',
      totalCount: 121,
    })

    observations.length = 0
    expect(distanceToLandrushIslandAmbientObstacles({ x: 5, z: 5 }, denseWorld.obstacles)).toBe(
      Math.hypot(4, 4),
    )
    expect(observations).toEqual([
      { candidateCount: 4, kind: 'obstacle-distance', totalCount: 121 },
    ])

    const start = { x: -66, z: 0 }
    const target = { x: 66, z: 0 }
    const structuralPath = findLandrushIslandAmbientWalkablePath(denseSource, start, target)
    observations.length = 0
    const firstIndexedPath = findLandrushIslandAmbientWalkablePath(denseWorld, start, target)
    const firstGraphQuery = observations.find((observation) => observation.kind === 'graph-query')
    expect(firstIndexedPath).toEqual(structuralPath)
    expect(firstIndexedPath.length).toBeGreaterThan(2)
    expect(firstGraphQuery?.candidateCount).toBeGreaterThan(0)
    expect(firstGraphQuery?.totalCount).toBeGreaterThanOrEqual(firstGraphQuery?.candidateCount ?? 0)
    for (let index = 1; index < firstIndexedPath.length; index += 1) {
      expect(
        isLandrushIslandAmbientSegmentPassable(
          denseWorld,
          firstIndexedPath[index - 1]!,
          firstIndexedPath[index]!,
        ),
      ).toBe(true)
    }

    observations.length = 0
    expect(findLandrushIslandAmbientWalkablePath(denseWorld, start, target)).toEqual(
      firstIndexedPath,
    )
    expect(observations.find((observation) => observation.kind === 'graph-query')).toEqual({
      candidateCount: 0,
      kind: 'graph-query',
      totalCount: firstGraphQuery?.totalCount,
    })
  })

  test('resumes exact simple, notched, and dense paths with deterministic strict budgets', () => {
    const fixtures = [
      {
        expected: [
          { x: -7, z: 0 },
          { x: -1.158_113_883_008_419, z: -3.474_341_649_025_257 },
          { x: 1.158_113_883_008_419, z: -3.474_341_649_025_257 },
          { x: 7, z: 0 },
        ],
        source: world,
        start: { x: -7, z: 0 },
        target: { x: 7, z: 0 },
      },
      {
        expected: [
          { x: -15, z: 12 },
          { x: 9.578_169_256_133_947, z: 9.731_562_253_903_421 },
          { x: 15, z: 12 },
        ],
        source: notchedWorld,
        start: { x: -15, z: 12 },
        target: { x: 15, z: 12 },
      },
      {
        expected: [
          { x: -66, z: 0 },
          { x: -61.353_553_390_593_28, z: -1.353_553_390_593_273_7 },
          { x: 61.353_553_390_593_28, z: -1.353_553_390_593_273_7 },
          { x: 66, z: 0 },
        ],
        source: {
          obstacles: createDenseObstacles(),
          roads: [],
          surfacePoints: [
            { x: -70, z: -70 },
            { x: 70, z: -70 },
            { x: 70, z: 70 },
            { x: -70, z: 70 },
          ],
        },
        start: { x: -66, z: 0 },
        target: { x: 66, z: 0 },
      },
    ] satisfies readonly {
      expected: readonly LandrushPoint2[]
      source: LandrushIslandAmbientNavigationWorld
      start: LandrushPoint2
      target: LandrushPoint2
    }[]

    for (const fixture of fixtures) {
      expect(
        findLandrushIslandAmbientWalkablePath(
          createLandrushIslandAmbientNavigationWorld(fixture.source),
          fixture.start,
          fixture.target,
        ),
      ).toEqual(fixture.expected)

      let expectedOperationCount: number | null = null
      for (const budget of [1, 7, 64]) {
        const result = runResumablePathSearch(
          createLandrushIslandAmbientNavigationWorld(fixture.source),
          fixture.start,
          fixture.target,
          budget,
        )
        expect(result.path).toEqual(fixture.expected)
        expect(result.maximumAdvanceOperations).toBeLessThanOrEqual(budget)
        if (expectedOperationCount === null) expectedOperationCount = result.totalOperations
        else expect(result.totalOperations).toBe(expectedOperationCount)
      }
    }
  })

  test('completes direct paths without spending resumable search operations', () => {
    const start = { x: -8, z: 8 }
    const target = { x: 8, z: 8 }
    const search = createLandrushIslandAmbientWalkablePathSearch(world, start, target)

    expect(advanceLandrushIslandAmbientWalkablePathSearch(search, 1)).toEqual({
      done: true,
      operations: 0,
      path: [start, target],
    })
    expect(() => advanceLandrushIslandAmbientWalkablePathSearch(search, 0)).toThrow(RangeError)
  })

  test('reuses state-owned resumable search results without changing path behavior', () => {
    const search = createLandrushIslandAmbientWalkablePathSearch(
      world,
      { x: -7, z: 0 },
      { x: 7, z: 0 },
    )
    const pendingResult = advanceLandrushIslandAmbientWalkablePathSearch(search, 1)
    expect(pendingResult.done).toBe(false)
    expect(advanceLandrushIslandAmbientWalkablePathSearch(search, 1)).toBe(pendingResult)

    let completedResult = advanceLandrushIslandAmbientWalkablePathSearch(search, 64)
    while (!completedResult.done) {
      completedResult = advanceLandrushIslandAmbientWalkablePathSearch(search, 64)
    }
    expect(completedResult.path).toEqual(
      findLandrushIslandAmbientWalkablePath(world, { x: -7, z: 0 }, { x: 7, z: 0 }),
    )
    expect(advanceLandrushIslandAmbientWalkablePathSearch(search, 64)).toBe(completedResult)
  })
})

function runResumablePathSearch(
  world: LandrushIslandAmbientNavigationWorld,
  start: LandrushPoint2,
  target: LandrushPoint2,
  budget: number,
) {
  const search = createLandrushIslandAmbientWalkablePathSearch(world, start, target)
  let maximumAdvanceOperations = 0
  let totalOperations = 0
  for (let advanceCount = 0; advanceCount < 1_000_000; advanceCount += 1) {
    const result = advanceLandrushIslandAmbientWalkablePathSearch(search, budget)
    if (result.operations > budget) throw new Error('Resumable path search exceeded its budget.')
    if (!result.done && result.operations === 0) {
      throw new Error('Resumable path search made no progress.')
    }
    maximumAdvanceOperations = Math.max(maximumAdvanceOperations, result.operations)
    totalOperations += result.operations
    if (result.done) return { maximumAdvanceOperations, path: result.path, totalOperations }
  }
  throw new Error('Resumable path search did not complete.')
}

function createDenseObstacles() {
  return Array.from({ length: 121 }, (_, index) => {
    const centerX = ((index % 11) - 5) * 12
    const centerZ = (Math.floor(index / 11) - 5) * 12
    return {
      id: `dense-${index}`,
      points: squarePoints(centerX, centerZ, 1),
    }
  })
}

function squarePoints(centerX: number, centerZ: number, halfExtent: number): LandrushPoint2[] {
  return [
    { x: centerX - halfExtent, z: centerZ - halfExtent },
    { x: centerX + halfExtent, z: centerZ - halfExtent },
    { x: centerX + halfExtent, z: centerZ + halfExtent },
    { x: centerX - halfExtent, z: centerZ + halfExtent },
  ]
}

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
