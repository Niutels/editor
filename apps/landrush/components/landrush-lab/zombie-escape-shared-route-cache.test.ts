import { describe, expect, test } from 'bun:test'
import {
  clearZombieEscapeSharedRouteCache,
  createZombieEscapeSharedRouteCache,
  publishZombieEscapeSharedComponentRoute,
  publishZombieEscapeSharedRoute,
  readZombieEscapeSharedComponentRouteWaypoint,
  readZombieEscapeSharedRouteWaypoint,
} from '@landrush/zombie-gameplay/zombie-escape-shared-route-cache'

const COMPONENTS = {
  fallbackSameLayerComponentIndices: Int32Array.from([0, 0, 1, 1]),
  regionCount: 3,
  strictSameLayerComponentIndices: Int32Array.from([0, 0, 1, 2]),
}

describe('Zombie Escape shared route cache', () => {
  test('publishes and reads one route per region without replacing its typed storage', () => {
    const cache = createZombieEscapeSharedRouteCache(COMPONENTS)
    const waypointStorage = cache.waypointNodeByRegion

    expect(publishZombieEscapeSharedRoute(cache, 1, 42, true, 7, 11, 13)).toBe(true)
    expect(readZombieEscapeSharedRouteWaypoint(cache, 1, 7, 11, 13)).toBe(42)
    expect(cache.fallbackByRegion[1]).toBe(1)
    expect(publishZombieEscapeSharedRoute(cache, 1, 42, true, 7, 11, 13)).toBe(false)

    expect(publishZombieEscapeSharedRoute(cache, 1, 51, false, 8, 12, 14)).toBe(true)
    expect(cache.waypointNodeByRegion).toBe(waypointStorage)
    expect(readZombieEscapeSharedRouteWaypoint(cache, 1, 8, 12, 14)).toBe(51)
    expect(cache.fallbackByRegion[1]).toBe(0)
  })

  test('rejects stale route, target, and world stamps and clears in place', () => {
    const cache = createZombieEscapeSharedRouteCache({ ...COMPONENTS, regionCount: 2 })
    publishZombieEscapeSharedRoute(cache, 0, 9, false, 3, 5, 7)

    expect(readZombieEscapeSharedRouteWaypoint(cache, 0, 2, 5, 7)).toBe(-1)
    expect(readZombieEscapeSharedRouteWaypoint(cache, 0, 3, 4, 7)).toBe(-1)
    expect(readZombieEscapeSharedRouteWaypoint(cache, 0, 3, 5, 6)).toBe(-1)
    expect(readZombieEscapeSharedRouteWaypoint(cache, -1, 3, 5, 7)).toBe(-1)
    expect(publishZombieEscapeSharedRoute(cache, 2, 9, false, 3, 5, 7)).toBe(false)

    clearZombieEscapeSharedRouteCache(cache)
    expect(readZombieEscapeSharedRouteWaypoint(cache, 0, 3, 5, 7)).toBe(-1)
    expect([...cache.waypointNodeByRegion]).toEqual([-1, -1])
  })

  test('shares one stamped waypoint across different regions in the same component lane', () => {
    const cache = createZombieEscapeSharedRouteCache(COMPONENTS)
    const strictStorage = cache.strictComponentRoutes.waypointNode
    const fallbackStorage = cache.fallbackComponentRoutes.waypointNode

    expect(publishZombieEscapeSharedComponentRoute(cache, 0, 42, false, 7, 11, 13)).toBe(true)
    expect(readZombieEscapeSharedComponentRouteWaypoint(cache, 0, false, 7, 11, 13)).toBe(42)
    expect(readZombieEscapeSharedComponentRouteWaypoint(cache, 1, false, 7, 11, 13)).toBe(-1)
    expect(publishZombieEscapeSharedComponentRoute(cache, 1, 51, true, 7, 11, 13)).toBe(true)
    expect(readZombieEscapeSharedComponentRouteWaypoint(cache, 1, true, 7, 11, 13)).toBe(51)
    expect(cache.strictComponentRoutes.waypointNode).toBe(strictStorage)
    expect(cache.fallbackComponentRoutes.waypointNode).toBe(fallbackStorage)

    clearZombieEscapeSharedRouteCache(cache)
    expect(readZombieEscapeSharedComponentRouteWaypoint(cache, 0, false, 7, 11, 13)).toBe(-1)
    expect(readZombieEscapeSharedComponentRouteWaypoint(cache, 1, true, 7, 11, 13)).toBe(-1)
  })
})
