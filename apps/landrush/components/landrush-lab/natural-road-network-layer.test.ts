import polygonClipping from 'polygon-clipping'
import { describe, expect, test } from 'vitest'
import type { LandrushRoadSegment } from '@/components/landrush/types'
import {
  createLandrushIslandGrassRoadSegments,
  createLandrushIslandSceneGraph,
  LANDRUSH_ISLAND_EXPERIENCE_CONFIGS,
} from './landrush-island-world'
import {
  auditNaturalRoadGeometry,
  createNaturalRoadPlan,
  NATURAL_ROAD_STYLE,
  NaturalRoadNetworkLayer,
  resolveNaturalRoadDebugMode,
} from './natural-road-network-layer'
import {
  PASCAL_WORLD_ELEVATION_PARAMETERS,
  PASCAL_WORLD_WATER_MATERIAL_PARAMETERS,
} from './pascal-world-visual-defaults'
import {
  WATER_LAB_DEFAULT_FIELD_PARAMETERS,
  WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
} from './water-lab-parameters'

const center = { x: 0, z: 0 }
const roadEnds = [
  { id: 'north', point: { x: 0, z: 8 } },
  { id: 'east', point: { x: 8, z: 0 } },
  { id: 'south', point: { x: 0, z: -8 } },
  { id: 'west', point: { x: -8, z: 0 } },
] as const

const roads: LandrushRoadSegment[] = roadEnds.map(({ id, point }) => ({
  connectsParcelIds: [],
  fromNodeId: 'junction',
  id: `road-${id}`,
  kind: 'spine',
  points: [center, point],
  r3fPoints: [
    [center.x, 0, center.z],
    [point.x, 0, point.z],
  ],
  toNodeId: id,
  width: NATURAL_ROAD_STYLE.carriageway.widthMeters,
}))
const perimeter = [
  { x: -10, z: -10 },
  { x: 10, z: -10 },
  { x: 10, z: 10 },
  { x: -10, z: 10 },
] as const

describe('natural road network geometry', () => {
  test('keeps the memoized layer props unchanged for an unrelated game query', () => {
    const planIdentity = {}
    const before = {
      debugMode: resolveNaturalRoadDebugMode(new URLSearchParams(), 'final'),
      plan: planIdentity,
    }
    const after = {
      debugMode: resolveNaturalRoadDebugMode(new URLSearchParams('game=zombie-escape'), 'final'),
      plan: planIdentity,
    }
    const memoizedComponent = NaturalRoadNetworkLayer as unknown as {
      $$typeof: symbol
      compare: null | ((left: unknown, right: unknown) => boolean)
    }

    expect(memoizedComponent.$$typeof).toBe(Symbol.for('react.memo'))
    expect(memoizedComponent.compare).toBeNull()
    expect(after.debugMode).toBe(before.debugMode)
    expect(after.plan).toBe(before.plan)
  })

  test('changes the exact layer debug prop for the width-audit query', () => {
    const before = resolveNaturalRoadDebugMode(new URLSearchParams(), 'final')
    const after = resolveNaturalRoadDebugMode(
      new URLSearchParams('naturalRoadDebug=width'),
      'final',
    )

    expect(before).toBe('final')
    expect(after).toBe('width-audit')
    expect(after).not.toBe(before)
  })

  test('builds the default multiplayer island road plan deterministically', () => {
    const { landrushLayoutNode, sceneGraph } = createLandrushIslandSceneGraph({
      elevationParameters: PASCAL_WORLD_ELEVATION_PARAMETERS,
      fieldParameters: WATER_LAB_DEFAULT_FIELD_PARAMETERS,
      islandParameters: WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
      layoutConfig: LANDRUSH_ISLAND_EXPERIENCE_CONFIGS['pascal-multiplayer-island'],
      materialParameters: PASCAL_WORLD_WATER_MATERIAL_PARAMETERS,
      omitWaterNode: true,
      showDepthReference: false,
      terrainFieldResolution: 384,
    })
    const site = sceneGraph.nodes[sceneGraph.rootNodeIds[0]!]
    if (site?.type !== 'site') throw new Error('Expected the multiplayer island site')
    const islandPerimeter = site.polygon.points.map(([x, z]) => ({ x, z }))
    const islandRoads = createLandrushIslandGrassRoadSegments(landrushLayoutNode.roads.segments)

    const first = createNaturalRoadPlan({
      elevation: 0,
      perimeter: islandPerimeter,
      quality: 'high',
      roads: islandRoads,
      seed: 'cala',
    })
    const second = createNaturalRoadPlan({
      elevation: 0,
      perimeter: islandPerimeter,
      quality: 'high',
      roads: islandRoads,
      seed: 'cala',
    })
    const reversed = createNaturalRoadPlan({
      elevation: 0,
      perimeter: islandPerimeter,
      quality: 'high',
      roads: [...islandRoads].reverse(),
      seed: 'cala',
    })
    const rings = Object.values(first.footprints).flatMap((area) => area.flat())

    expect(second.footprints).toEqual(first.footprints)
    expect(reversed.footprints).toEqual(first.footprints)
    expect(first.footprints.asphalt.length).toBeGreaterThan(0)
    expect(rings.length).toBeGreaterThan(0)
    expect(
      rings.every((ring) => {
        const firstPoint = ring[0]
        const lastPoint = ring.at(-1)
        return (
          firstPoint !== undefined &&
          lastPoint !== undefined &&
          firstPoint[0] === lastPoint[0] &&
          firstPoint[1] === lastPoint[1] &&
          ring.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z)) &&
          ring.slice(1).every(([x, z], index) => {
            const previous = ring[index]
            return previous !== undefined && (previous[0] !== x || previous[1] !== z)
          })
        )
      }),
    ).toBe(true)
    expect(first.roadGeometryAudit.failureCount).toBe(0)
    expect(first.roadGeometryAudit.minimumHalfWidthMeters).toBeGreaterThanOrEqual(
      first.roadGeometryAudit.requiredHalfWidthMeters - 0.001,
    )
    expect(first.roadGeometryAudit.maximumParallelDeviationMeters).toBeLessThan(0.001)
    expect(first.roadGeometryAudit.maximumBoundaryTurnDegrees).toBeLessThan(23)
    expect(first.metrics.sidewalkOffsetAudit.maximumAbsoluteErrorMeters).toBeLessThan(0.01)
  }, 30_000)

  test('replaces hard intersection corners with radius curb returns', () => {
    const plan = createNaturalRoadPlan({
      elevation: 0,
      perimeter,
      quality: 'high',
      roads,
      seed: 'cala',
    })
    const halfRoadWidth = NATURAL_ROAD_STYLE.carriageway.widthMeters / 2
    const returnRadius = NATURAL_ROAD_STYLE.carriageway.intersectionCornerRadiusMeters
    const returnCenter = halfRoadWidth + returnRadius
    const northeastArcVertices = plan.footprints.asphalt
      .flat(2)
      .filter(
        ([x, z]) =>
          x >= halfRoadWidth - 0.001 &&
          z >= halfRoadWidth - 0.001 &&
          x <= returnCenter + 0.001 &&
          z <= returnCenter + 0.001 &&
          Math.abs(Math.hypot(x - returnCenter, z - returnCenter) - returnRadius) < 0.001,
      )

    expect(northeastArcVertices.length).toBeGreaterThan(4)
    expect(
      northeastArcVertices.some(
        ([x, z]) => Math.abs(x - returnCenter) < 0.001 && Math.abs(z - halfRoadWidth) < 0.001,
      ),
    ).toBe(true)
    expect(
      northeastArcVertices.some(
        ([x, z]) => Math.abs(x - halfRoadWidth) < 0.001 && Math.abs(z - returnCenter) < 0.001,
      ),
    ).toBe(true)
    expect(plan.roadGeometryAudit.maximumBoundaryTurnDegrees).toBeLessThan(23)
    expect(plan.roadGeometryAudit.failureCount).toBe(0)
  })

  test('keeps the sidewalk a constant-width offset around a curb return', () => {
    const plan = createNaturalRoadPlan({
      elevation: 0,
      perimeter,
      quality: 'high',
      roads,
      seed: 'cala',
    })
    const halfRoadWidth = NATURAL_ROAD_STYLE.carriageway.widthMeters / 2
    const returnCenter =
      halfRoadWidth + NATURAL_ROAD_STYLE.carriageway.intersectionCornerRadiusMeters
    const asphaltMidpoint = nearestNortheastDiagonalPoint(
      plan.footprints.asphalt,
      halfRoadWidth,
      returnCenter,
    )
    const sidewalkOuterMidpoint = nearestNortheastDiagonalPoint(
      plan.footprints.outerSidewalk,
      halfRoadWidth,
      returnCenter,
    )

    expect(asphaltMidpoint).toBeDefined()
    expect(sidewalkOuterMidpoint).toBeDefined()
    const concentricArcToleranceMeters = 0.005
    const polygonalChordToleranceMeters = 0.01
    const asphaltRadius = Math.hypot(
      (asphaltMidpoint?.[0] ?? 0) - returnCenter,
      (asphaltMidpoint?.[1] ?? 0) - returnCenter,
    )
    const sidewalkOuterRadius = Math.hypot(
      (sidewalkOuterMidpoint?.[0] ?? 0) - returnCenter,
      (sidewalkOuterMidpoint?.[1] ?? 0) - returnCenter,
    )
    const curbReturnWidth = asphaltRadius - sidewalkOuterRadius

    expect(Math.abs(curbReturnWidth - NATURAL_ROAD_STYLE.sidewalk.widthMeters)).toBeLessThan(
      concentricArcToleranceMeters,
    )
    expect(plan.metrics.sidewalkOffsetAudit.excessMeters).toBeLessThan(
      polygonalChordToleranceMeters,
    )
    expect(plan.metrics.sidewalkOffsetAudit.maximumAbsoluteErrorMeters).toBeLessThan(
      polygonalChordToleranceMeters,
    )
  })

  test('pinpoints a sub-width road cross-section in world coordinates', () => {
    const plan = createNaturalRoadPlan({
      elevation: 0,
      perimeter,
      quality: 'high',
      roads,
      seed: 'cala',
    })
    const defectiveAsphalt = polygonClipping.difference(plan.footprints.asphalt, [
      [
        [
          [0.72, 3.5],
          [2, 3.5],
          [2, 4.5],
          [0.72, 4.5],
          [0.72, 3.5],
        ],
      ],
    ])
    const audit = auditNaturalRoadGeometry({
      asphalt: defectiveAsphalt,
      perimeter,
      roads,
      roadWidths: plan.roadWidths,
    })
    const firstUnderWidthProbe = audit.probes.find((probe) => probe.status === 'under-width')

    expect(audit.failureCount).toBeGreaterThan(0)
    expect(audit.minimumHalfWidthMeters).toBeLessThan(0.8)
    expect(firstUnderWidthProbe?.roadId).toBe('road-north')
    expect(firstUnderWidthProbe?.center.x).toBeCloseTo(0, 4)
    expect(firstUnderWidthProbe?.center.z).toBeGreaterThanOrEqual(3.5)
    expect(firstUnderWidthProbe?.center.z).toBeLessThanOrEqual(4.5)
  })
})

function nearestNortheastDiagonalPoint(
  area: readonly (readonly (readonly (readonly [number, number])[])[])[],
  minimum: number,
  maximum: number,
) {
  return area
    .flat(2)
    .filter(([x, z]) => x > minimum && z > minimum && x < maximum && z < maximum)
    .sort((first, second) => Math.abs(first[0] - first[1]) - Math.abs(second[0] - second[1]))[0]
}
