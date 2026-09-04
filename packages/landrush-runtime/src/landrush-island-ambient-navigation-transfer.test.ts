import { describe, expect, test } from 'bun:test'
import {
  captureLandrushIslandAmbientPreparedNavigationWorld,
  createLandrushIslandAmbientNavigationWorld,
  findLandrushIslandAmbientWalkablePath,
  hydrateLandrushIslandAmbientPreparedNavigationWorld,
  isLandrushIslandAmbientPointWalkable,
} from './landrush-island-ambient-navigation'

describe('ambient navigation prepared-world transfer', () => {
  test('retains exact paths, spatial indexes, and warmed edge cache without rebuilding', () => {
    const world = createLandrushIslandAmbientNavigationWorld(
      {
        roads: [],
        surfacePoints: [
          { x: -20, z: -20 },
          { x: 20, z: -20 },
          { x: 20, z: 20 },
          { x: -20, z: 20 },
        ],
        obstacles: [
          {
            id: 'wall',
            points: [
              { x: -1, z: -5 },
              { x: 1, z: -5 },
              { x: 1, z: 5 },
              { x: -1, z: 5 },
            ],
          },
        ],
      },
      { observeSpatialQuery() {} },
    )
    const start = { x: -10, z: 0 }
    const end = { x: 10, z: 0 }
    const expected = findLandrushIslandAmbientWalkablePath(world, start, end)
    expect(expected.length).toBeGreaterThan(2)
    const prepared = structuredClone(captureLandrushIslandAmbientPreparedNavigationWorld(world))
    expect(prepared.navigationGraph.staticEdgePassability.size).toBeGreaterThan(0)
    const observed: { kind: string; candidateCount: number; totalCount: number }[] = []
    const hydrated = hydrateLandrushIslandAmbientPreparedNavigationWorld(prepared, {
      observeSpatialQuery: (event) => observed.push(event),
    })
    expect(hydrated).toBe(prepared.world)
    expect(findLandrushIslandAmbientWalkablePath(hydrated, start, end)).toEqual(expected)
    expect(observed.some((event) => event.kind === 'graph-build')).toBe(false)
    expect(observed.find((event) => event.kind === 'graph-query')?.candidateCount).toBe(0)
    expect(observed.some((event) => event.kind === 'obstacle-point')).toBe(true)
    expect(isLandrushIslandAmbientPointWalkable(hydrated, { x: 0, z: 0 })).toBe(false)
  })

  test('does not silently compile an unprepared transfer source', () => {
    expect(() =>
      captureLandrushIslandAmbientPreparedNavigationWorld({
        roads: [],
        obstacles: [],
        surfacePoints: [],
      }),
    ).toThrow('has not been prepared')
  })
})
