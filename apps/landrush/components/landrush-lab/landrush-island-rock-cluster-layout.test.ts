import { describe, expect, test } from 'bun:test'
import type { LandrushRoadSegment } from '@/components/landrush/types'
import type { GrassFieldBlocker } from './grass-field-texture'
import {
  createLandrushIslandRockClusterLayout,
  createLandrushIslandRockGrassBlockers,
  LANDRUSH_ISLAND_ENVIRONMENT_CLEARANCE,
  LANDRUSH_ISLAND_ROCK_CLUSTER_BUDGET,
  LANDRUSH_ISLAND_ROCK_CLUSTER_PLACEMENT,
  landrushIslandRockHorizontalFootprintRadius,
  resolveLandrushIslandVisibleRockClusterLayout,
  scaleLandrushIslandBuildingGrassClearance,
} from './landrush-island-rock-cluster-layout'

const RENDERED_ROAD_WIDTH_SCALE = 2.05

const PERIMETER = [
  { x: -30, z: -30 },
  { x: 30, z: -30 },
  { x: 30, z: 30 },
  { x: -30, z: 30 },
] as const

const ROADS: readonly LandrushRoadSegment[] = [
  {
    connectsParcelIds: [],
    fromNodeId: 'west',
    id: 'rock-layout-cross-road',
    kind: 'spine',
    points: [
      { x: -30, z: 0 },
      { x: 30, z: 0 },
    ],
    r3fPoints: [
      [-30, 0, 0],
      [30, 0, 0],
    ],
    toNodeId: 'east',
    width: 2.8,
  },
]

const BUILDING_BLOCKER: GrassFieldBlocker = {
  clearanceMeters: 1,
  featherMeters: 0.3,
  points: [
    { x: 10, z: 10 },
    { x: 16, z: 10 },
    { x: 16, z: 16 },
    { x: 10, z: 16 },
  ],
}

describe('Landrush island rock cluster layout', () => {
  test('creates a deterministic varied layout inside the fixed setup budget', () => {
    const layout = createLandrushIslandRockClusterLayout({
      blockers: [BUILDING_BLOCKER],
      elevation: 0.25,
      perimeter: PERIMETER,
      roadWidthScale: RENDERED_ROAD_WIDTH_SCALE,
      roads: ROADS,
    })
    const replay = createLandrushIslandRockClusterLayout({
      blockers: [BUILDING_BLOCKER],
      elevation: 0.25,
      perimeter: PERIMETER,
      roadWidthScale: RENDERED_ROAD_WIDTH_SCALE,
      roads: ROADS,
    })

    expect(layout).toEqual(replay)
    expect(layout.clusters.length).toBeGreaterThanOrEqual(
      LANDRUSH_ISLAND_ROCK_CLUSTER_PLACEMENT.minimumClusters,
    )
    expect(layout.clusters.length).toBeLessThanOrEqual(
      LANDRUSH_ISLAND_ROCK_CLUSTER_PLACEMENT.maximumClusters,
    )
    expect(layout.rocks.length).toBeLessThanOrEqual(
      LANDRUSH_ISLAND_ROCK_CLUSTER_BUDGET.maximumInstances,
    )
    expect(
      layout.rocks.length * LANDRUSH_ISLAND_ROCK_CLUSTER_BUDGET.trianglesPerInstance,
    ).toBeLessThanOrEqual(LANDRUSH_ISLAND_ROCK_CLUSTER_BUDGET.maximumTriangles)
    expect(
      new Set(layout.rocks.map(({ scale }) => scale.map((value) => value.toFixed(3)).join(':')))
        .size,
    ).toBeGreaterThan(6)
    expect(new Set(layout.rocks.map(({ variant }) => variant)).size).toBeLessThanOrEqual(
      LANDRUSH_ISLAND_ROCK_CLUSTER_BUDGET.maximumDrawCalls,
    )
  })

  test('keeps every rock footprint clear of rendered roads and cluster centers clear elsewhere', () => {
    const layout = createLandrushIslandRockClusterLayout({
      blockers: [BUILDING_BLOCKER],
      elevation: 0,
      perimeter: PERIMETER,
      roadWidthScale: RENDERED_ROAD_WIDTH_SCALE,
      roads: ROADS,
    })
    for (const rock of layout.rocks) {
      const distanceFromRenderedRoadEdge =
        Math.abs(rock.position[2]) -
        ROADS[0]!.width * RENDERED_ROAD_WIDTH_SCALE * 0.5 -
        landrushIslandRockHorizontalFootprintRadius(rock)
      expect(distanceFromRenderedRoadEdge).toBeGreaterThanOrEqual(
        LANDRUSH_ISLAND_ROCK_CLUSTER_PLACEMENT.roadEdgeClearanceMeters,
      )
    }
    for (let leftIndex = 0; leftIndex < layout.clusters.length; leftIndex += 1) {
      const left = layout.clusters[leftIndex]!
      expect(
        Math.min(30 - Math.abs(left.center.x), 30 - Math.abs(left.center.z)),
      ).toBeGreaterThanOrEqual(LANDRUSH_ISLAND_ROCK_CLUSTER_PLACEMENT.shoreClearanceMeters)
      expect(pointInExpandedBuilding(left.center.x, left.center.z)).toBe(false)
      for (let rightIndex = leftIndex + 1; rightIndex < layout.clusters.length; rightIndex += 1) {
        const right = layout.clusters[rightIndex]!
        expect(
          Math.hypot(left.center.x - right.center.x, left.center.z - right.center.z),
        ).toBeGreaterThanOrEqual(LANDRUSH_ISLAND_ROCK_CLUSTER_PLACEMENT.minimumClusterSpacingMeters)
      }
    }
  })

  test('hides only building-overlapping rocks without replacing the stable layout', () => {
    const layout = createLandrushIslandRockClusterLayout({
      elevation: 0,
      perimeter: PERIMETER,
      roadWidthScale: RENDERED_ROAD_WIDTH_SCALE,
      roads: ROADS,
    })
    const blockedRock = layout.rocks[0]!
    const [x, , z] = blockedRock.position
    const building: GrassFieldBlocker = {
      clearanceMeters: 1,
      featherMeters: 0.3,
      points: [
        { x: x - 0.1, z: z - 0.1 },
        { x: x + 0.1, z: z - 0.1 },
        { x: x + 0.1, z: z + 0.1 },
        { x: x - 0.1, z: z + 0.1 },
      ],
    }

    const visibleLayout = resolveLandrushIslandVisibleRockClusterLayout({
      blockers: [building],
      layout,
    })

    expect(visibleLayout).not.toBe(layout)
    expect(layout.rocks).toContain(blockedRock)
    expect(visibleLayout.rocks).not.toContain(blockedRock)
    expect(visibleLayout.rocks).toEqual(
      layout.rocks.filter((rock) => visibleLayout.rocks.includes(rock)),
    )
    expect(visibleLayout.clusters.flatMap((cluster) => cluster.rocks)).toEqual(visibleLayout.rocks)
    expect(resolveLandrushIslandVisibleRockClusterLayout({ blockers: [], layout })).toBe(layout)
  })

  test('uses 70% building clearance and one-quarter of that radius around rocks', () => {
    const scaled = scaleLandrushIslandBuildingGrassClearance([BUILDING_BLOCKER])
    expect(BUILDING_BLOCKER.clearanceMeters).toBe(1)
    expect(scaled[0]!.clearanceMeters).toBeCloseTo(0.7, 12)
    expect(LANDRUSH_ISLAND_ENVIRONMENT_CLEARANCE.buildingGrassScale).toBe(0.7)
    expect(
      LANDRUSH_ISLAND_ENVIRONMENT_CLEARANCE.rockGrassMeters /
        LANDRUSH_ISLAND_ENVIRONMENT_CLEARANCE.resolvedBuildingGrassMeters,
    ).toBe(LANDRUSH_ISLAND_ENVIRONMENT_CLEARANCE.rockToBuildingRatio)

    const layout = createLandrushIslandRockClusterLayout({
      elevation: 0,
      perimeter: PERIMETER,
      roadWidthScale: RENDERED_ROAD_WIDTH_SCALE,
      roads: ROADS,
    })
    const blockers = createLandrushIslandRockGrassBlockers(layout)
    expect(blockers).toHaveLength(layout.rocks.length)
    expect(
      blockers.every(
        ({ clearanceMeters }) =>
          clearanceMeters === LANDRUSH_ISLAND_ENVIRONMENT_CLEARANCE.rockGrassMeters,
      ),
    ).toBe(true)
    const clearedArea = blockers.reduce((total, blocker) => total + polygonArea(blocker.points), 0)
    expect(clearedArea / polygonArea(PERIMETER)).toBeGreaterThan(0.001)
    expect(clearedArea / polygonArea(PERIMETER)).toBeLessThan(0.05)
  })
})

function pointInExpandedBuilding(x: number, z: number) {
  const padding =
    (BUILDING_BLOCKER.clearanceMeters ?? 0) +
    LANDRUSH_ISLAND_ROCK_CLUSTER_PLACEMENT.blockerAvoidanceMeters
  return x >= 10 - padding && x <= 16 + padding && z >= 10 - padding && z <= 16 + padding
}

function polygonArea(points: readonly { x: number; z: number }[]) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    area += current.x * next.z - next.x * current.z
  }
  return Math.abs(area) * 0.5
}
