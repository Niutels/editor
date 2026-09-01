import { describe, expect, test } from 'bun:test'
import type { LandrushRoadSegment } from '@/components/landrush/types'
import {
  advanceLandrushZombieNightAmount,
  createLandrushZombieNightBeaconPlacements,
  LANDRUSH_ZOMBIE_NIGHT_ACTIVE_LIGHT_COUNTS,
  LANDRUSH_ZOMBIE_NIGHT_BASE_EXPOSURE,
  LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS,
  LANDRUSH_ZOMBIE_NIGHT_CPU_PRESENTATION_INTERVAL_SECONDS,
  LANDRUSH_ZOMBIE_NIGHT_GLOW_DRAW_CALL_BUDGET,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAYOUT,
  LANDRUSH_ZOMBIE_NIGHT_SUNSET_END_SECONDS,
  LANDRUSH_ZOMBIE_NIGHT_TRANSITION_DURATION_SECONDS,
  LANDRUSH_ZOMBIE_NIGHT_VISUAL_CONTRACT,
  parseLandrushZombieNightDebugQuery,
  resolveLandrushZombieNightBeaconFrameMode,
  resolveLandrushZombieNightBeaconPulse,
  resolveLandrushZombieNightSunsetAmount,
  resolveLandrushZombieNightSurfaceRole,
  resolveLandrushZombieNightTargetExposure,
  resolveLandrushZombieNightTimelineAmount,
  resolveLandrushZombieNightVisibilityTreatment,
  resolveLandrushZombieNightVisualAmount,
  selectLandrushZombieNightActiveLightPlacements,
  shouldApplyLandrushZombieNightCpuPresentation,
  shouldPublishLandrushZombieNightDebugSnapshot,
} from './landrush-zombie-night-presentation-state'
import {
  createLandrushZombieNightStreetLightpostBaseFootprint,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_BASE_ALONG_ROAD_HALF_WIDTH_METERS,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_BASE_CROSS_ROAD_HALF_WIDTH_METERS,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_MODEL_SCALE,
  resolveLandrushZombieNightStreetLightpostYaw,
} from './landrush-zombie-night-street-lightpost'
import {
  createNaturalRoadPlan,
  NATURAL_ROAD_STYLE,
  naturalRoadSidewalkContainsFootprint,
} from './natural-road-plan'

const ROADS: readonly LandrushRoadSegment[] = [
  {
    connectsParcelIds: [],
    fromNodeId: 'west',
    id: 'spine-west-east',
    kind: 'spine',
    points: [
      { x: -18, z: 0 },
      { x: 0, z: 0 },
      { x: 18, z: 2 },
    ],
    r3fPoints: [
      [-18, 0, 0],
      [0, 0, 0],
      [18, 0, 2],
    ],
    toNodeId: 'east',
    width: 2.8,
  },
  {
    connectsParcelIds: [],
    fromNodeId: 'south',
    id: 'spine-south-north',
    kind: 'spine',
    points: [
      { x: 0, z: -18 },
      { x: 1, z: 0 },
      { x: 2, z: 18 },
    ],
    r3fPoints: [
      [0, 0, -18],
      [1, 0, 0],
      [2, 0, 18],
    ],
    toNodeId: 'north',
    width: 2.8,
  },
] as const

const PERIMETER: readonly { x: number; z: number }[] = [
  { x: -32, z: -32 },
  { x: 32, z: -32 },
  { x: 32, z: 32 },
  { x: -32, z: 32 },
  { x: -32, z: -32 },
]

const ROAD_PLAN = createNaturalRoadPlan({
  elevation: 1.25,
  perimeter: PERIMETER,
  quality: 'high',
  roads: ROADS,
  seed: 'cala',
})

describe('Landrush zombie night presentation state', () => {
  test('parses deterministic inspection modes, quality, and fixed transition amount', () => {
    expect(
      parseLandrushZombieNightDebugQuery(
        new URLSearchParams(
          'zombieNightView=no-post&zombieNightQuality=high&zombieNightAmount=1.7&zombieNightVisibility=world50',
        ),
      ),
    ).toEqual({ fixedAmount: 1, mode: 'no-post', quality: 'high', visibility: 'world50' })
    expect(
      parseLandrushZombieNightDebugQuery(
        new URLSearchParams(
          'zombieNightView=unsupported&zombieNightQuality=unsupported&zombieNightAmount=nope&zombieNightVisibility=unsupported',
        ),
      ),
    ).toEqual({
      fixedAmount: null,
      mode: 'final',
      quality: 'balanced',
      visibility: 'normal',
    })
    expect(
      parseLandrushZombieNightDebugQuery(new URLSearchParams('zombieNightVisibility=zombies50'))
        .visibility,
    ).toBe('zombies50')
  })

  test('publishes the global diagnostic snapshot only for an explicit diagnostic query', () => {
    expect(shouldPublishLandrushZombieNightDebugSnapshot(new URLSearchParams())).toBe(false)
    expect(
      shouldPublishLandrushZombieNightDebugSnapshot(new URLSearchParams('zombieNightDebug=1')),
    ).toBe(true)
    expect(shouldPublishLandrushZombieNightDebugSnapshot(new URLSearchParams('bench=1'))).toBe(true)
    expect(
      shouldPublishLandrushZombieNightDebugSnapshot(new URLSearchParams('zombieNightAmount=0.5')),
    ).toBe(true)
    expect(
      shouldPublishLandrushZombieNightDebugSnapshot(
        new URLSearchParams('zombieNightVisibility=world50'),
      ),
    ).toBe(true)
  })

  test('resolves stable shipping and isolated diagnostic visibility treatments', () => {
    const shipping = resolveLandrushZombieNightVisibilityTreatment('normal')
    expect(shipping).toEqual({ outsideTorchVisibility: 0.8, worldExposureScale: 0.5 })
    expect(shipping.worldExposureScale * shipping.outsideTorchVisibility).toBe(0.4)
    expect(shipping.worldExposureScale).toBe(0.5)
    expect(resolveLandrushZombieNightVisibilityTreatment('normal')).toBe(shipping)
    expect(resolveLandrushZombieNightVisibilityTreatment('world50')).toEqual({
      outsideTorchVisibility: 1,
      worldExposureScale: 0.5,
    })
    expect(resolveLandrushZombieNightVisibilityTreatment('zombies50')).toEqual({
      outsideTorchVisibility: 0.5,
      worldExposureScale: 1,
    })
  })

  test('applies shipping and diagnostic exposure scales to the settled night', () => {
    expect(
      resolveLandrushZombieNightTargetExposure({
        mode: 'final',
        nightExposure: LANDRUSH_ZOMBIE_NIGHT_BASE_EXPOSURE,
        visibility: 'normal',
      }),
    ).toBe(0.39)
    expect(
      resolveLandrushZombieNightTargetExposure({
        mode: 'final',
        nightExposure: LANDRUSH_ZOMBIE_NIGHT_BASE_EXPOSURE,
        visibility: 'zombies50',
      }),
    ).toBe(0.78)
    expect(
      resolveLandrushZombieNightTargetExposure({
        mode: 'final',
        nightExposure: LANDRUSH_ZOMBIE_NIGHT_BASE_EXPOSURE,
        visibility: 'world50',
      }),
    ).toBe(0.39)
    expect(
      resolveLandrushZombieNightTargetExposure({
        mode: 'no-post',
        nightExposure: LANDRUSH_ZOMBIE_NIGHT_BASE_EXPOSURE,
        visibility: 'normal',
      }),
    ).toBe(1)
    expect(
      resolveLandrushZombieNightTargetExposure({
        mode: 'no-post',
        nightExposure: LANDRUSH_ZOMBIE_NIGHT_BASE_EXPOSURE,
        visibility: 'world50',
      }),
    ).toBe(0.5)
    expect(
      resolveLandrushZombieNightTargetExposure({
        mode: 'no-post',
        nightExposure: LANDRUSH_ZOMBIE_NIGHT_BASE_EXPOSURE,
        visibility: 'zombies50',
      }),
    ).toBe(1)
  })

  test('keeps the transition response frame-rate independent', () => {
    let sixtyFps = 0
    for (let index = 0; index < 60; index += 1) {
      sixtyFps = advanceLandrushZombieNightAmount(sixtyFps, 1, 1 / 60)
    }
    let tenFps = 0
    for (let index = 0; index < 10; index += 1) {
      tenFps = advanceLandrushZombieNightAmount(tenFps, 1, 0.1)
    }
    expect(sixtyFps).toBeCloseTo(tenFps, 12)
    expect(sixtyFps).toBeGreaterThan(0.75)
    expect(sixtyFps).toBeLessThan(1)
  })

  test('passes through an early sunset and reaches the existing night exactly at 90 seconds', () => {
    expect(resolveLandrushZombieNightTimelineAmount(-1)).toBe(0)
    expect(resolveLandrushZombieNightTimelineAmount(0)).toBe(0)
    expect(resolveLandrushZombieNightTimelineAmount(30)).toBeCloseTo(0.209_876_543_2, 10)
    expect(resolveLandrushZombieNightTimelineAmount(60)).toBeCloseTo(0.790_123_456_8, 10)
    expect(
      resolveLandrushZombieNightTimelineAmount(LANDRUSH_ZOMBIE_NIGHT_TRANSITION_DURATION_SECONDS),
    ).toBe(1)
    expect(resolveLandrushZombieNightTimelineAmount(Number.POSITIVE_INFINITY)).toBe(1)

    expect(resolveLandrushZombieNightSunsetAmount(0)).toBe(0)
    expect(resolveLandrushZombieNightSunsetAmount(1)).toBeGreaterThan(0)
    expect(resolveLandrushZombieNightSunsetAmount(18)).toBe(1)
    expect(resolveLandrushZombieNightSunsetAmount(28)).toBe(1)
    expect(resolveLandrushZombieNightSunsetAmount(44)).toBeCloseTo(0.5, 12)
    expect(resolveLandrushZombieNightSunsetAmount(59)).toBeGreaterThan(0)
    expect(resolveLandrushZombieNightSunsetAmount(LANDRUSH_ZOMBIE_NIGHT_SUNSET_END_SECONDS)).toBe(0)
    expect(resolveLandrushZombieNightSunsetAmount(90)).toBe(0)
    expect(resolveLandrushZombieNightSunsetAmount(Number.POSITIVE_INFINITY)).toBe(0)

    const firstSecondNightAmount = resolveLandrushZombieNightTimelineAmount(1)
    const firstSecondSunsetAmount = resolveLandrushZombieNightSunsetAmount(1)
    expect(firstSecondNightAmount).toBeLessThan(0.001)
    expect(firstSecondSunsetAmount).toBeGreaterThan(0.001)
    expect(
      resolveLandrushZombieNightVisualAmount(firstSecondNightAmount, firstSecondSunsetAmount),
    ).toBe(firstSecondSunsetAmount)
  })

  test('bounds CPU presentation writes while still applying invalidations and exact endpoints', () => {
    expect(shouldApplyLandrushZombieNightCpuPresentation(Number.NaN, 0.2, 1, 1, 2, false)).toBe(
      true,
    )
    expect(shouldApplyLandrushZombieNightCpuPresentation(0.2, 0.3, 1, 1, 2, false)).toBe(false)
    expect(shouldApplyLandrushZombieNightCpuPresentation(0.2, 0.3, 1, 1, 2, true)).toBe(true)
    expect(shouldApplyLandrushZombieNightCpuPresentation(0.2, 0.3, 1, 2, 2, false)).toBe(true)
    expect(shouldApplyLandrushZombieNightCpuPresentation(0.99, 1, 1, 1, 2, false)).toBe(true)
    expect(shouldApplyLandrushZombieNightCpuPresentation(1, 1, 1, 3, 2, false)).toBe(false)

    let appliedAmount = Number.NaN
    let nextUpdateAt = 0
    let updates = 0
    for (let frame = 0; frame <= 120; frame += 1) {
      const elapsedSeconds = frame / 120
      const amount = frame === 120 ? 1 : elapsedSeconds
      if (
        !shouldApplyLandrushZombieNightCpuPresentation(
          appliedAmount,
          amount,
          1,
          elapsedSeconds,
          nextUpdateAt,
          false,
        )
      ) {
        continue
      }
      updates += 1
      appliedAmount = amount
      nextUpdateAt = elapsedSeconds + LANDRUSH_ZOMBIE_NIGHT_CPU_PRESENTATION_INTERVAL_SECONDS
    }
    expect(updates).toBeLessThanOrEqual(26)
    expect(appliedAmount).toBe(1)
  })

  test('selects stable, finite beacon placements and honors the quality budget', () => {
    const balanced = createLandrushZombieNightBeaconPlacements({
      quality: 'balanced',
      roadPlan: ROAD_PLAN,
    })
    const replay = createLandrushZombieNightBeaconPlacements({
      quality: 'balanced',
      roadPlan: ROAD_PLAN,
    })
    const low = createLandrushZombieNightBeaconPlacements({
      quality: 'low',
      roadPlan: ROAD_PLAN,
    })
    expect(balanced).toEqual(replay)
    expect(balanced.length).toBeGreaterThanOrEqual(8)
    expect(balanced.length).toBeLessThanOrEqual(LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS.balanced)
    expect(low.length).toBeLessThanOrEqual(LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS.low)
    expect(low.length).toBeLessThanOrEqual(balanced.length)
    expect(new Set(balanced.map(({ id }) => id)).size).toBe(balanced.length)
    expect(
      balanced.every(({ phase, position, rotationY }) =>
        [phase, rotationY, ...position].every((value) => Number.isFinite(value)),
      ),
    ).toBe(true)
  })

  test('decouples physical pole density from a deterministic bounded light and glow budget', () => {
    for (const quality of ['low', 'balanced', 'high'] as const) {
      const placements = createLandrushZombieNightBeaconPlacements({
        quality,
        roadPlan: ROAD_PLAN,
      })
      const selected = selectLandrushZombieNightActiveLightPlacements({ placements, quality })
      const replay = selectLandrushZombieNightActiveLightPlacements({ placements, quality })
      expect(selected).toEqual(replay)
      expect(selected).toHaveLength(
        Math.min(placements.length, LANDRUSH_ZOMBIE_NIGHT_ACTIVE_LIGHT_COUNTS[quality]),
      )
      expect(selected.every((placement) => placements.includes(placement))).toBe(true)
    }

    expect(LANDRUSH_ZOMBIE_NIGHT_ACTIVE_LIGHT_COUNTS).toEqual({
      balanced: 4,
      high: 6,
      low: 3,
    })
    expect(LANDRUSH_ZOMBIE_NIGHT_ACTIVE_LIGHT_COUNTS.balanced).toBeLessThan(
      LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS.balanced,
    )
    expect(LANDRUSH_ZOMBIE_NIGHT_GLOW_DRAW_CALL_BUDGET).toBe(3)
  })

  test('aims each overhanging lamp arm from its curb side back toward the road', () => {
    expect(resolveLandrushZombieNightStreetLightpostYaw(1, 0, -1)).toBeCloseTo(0, 12)
    expect(Math.abs(resolveLandrushZombieNightStreetLightpostYaw(1, 0, 1))).toBeCloseTo(Math.PI, 12)
    expect(resolveLandrushZombieNightStreetLightpostYaw(0, 1, 1)).toBeCloseTo(Math.PI / 2, 12)
  })

  test('maps the measured rectangular base through the rendered Three.js yaw', () => {
    const position = [10, 4, 20] as const
    const unrotated = createLandrushZombieNightStreetLightpostBaseFootprint(position, 0)
    expect(unrotated[0]!.x).toBeCloseTo(
      position[0] - LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_BASE_ALONG_ROAD_HALF_WIDTH_METERS,
      12,
    )
    expect(unrotated[0]!.z).toBeCloseTo(
      position[2] - LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_BASE_CROSS_ROAD_HALF_WIDTH_METERS,
      12,
    )
    const quarterTurn = createLandrushZombieNightStreetLightpostBaseFootprint(position, Math.PI / 2)
    expect(quarterTurn[0]!.x).toBeCloseTo(
      position[0] - LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_BASE_CROSS_ROAD_HALF_WIDTH_METERS,
      12,
    )
    expect(quarterTurn[0]!.z).toBeCloseTo(
      position[2] + LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_BASE_ALONG_ROAD_HALF_WIDTH_METERS,
      12,
    )
  })

  test('keeps every full fixture base on top of the natural curb and outside the spacing floor', () => {
    const placements = createLandrushZombieNightBeaconPlacements({
      quality: 'balanced',
      roadPlan: ROAD_PLAN,
    })
    const innerEdge = NATURAL_ROAD_STYLE.carriageway.widthMeters * 0.5
    const outerEdge = innerEdge + NATURAL_ROAD_STYLE.sidewalk.widthMeters
    const baseHalfWidth = LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_BASE_CROSS_ROAD_HALF_WIDTH_METERS
    expect(baseHalfWidth * 2).toBeLessThan(NATURAL_ROAD_STYLE.sidewalk.widthMeters)
    expect(LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_MODEL_SCALE).toEqual([2, 3.4, 2])
    for (const placement of placements) {
      const road = ROADS.find(({ id }) => id === placement.roadId)
      expect(road).toBeDefined()
      expect(placement.roadOffsetMeters - baseHalfWidth).toBeGreaterThan(innerEdge)
      expect(placement.roadOffsetMeters + baseHalfWidth).toBeLessThan(outerEdge)
      expect(outerEdge - (placement.roadOffsetMeters + baseHalfWidth)).toBeCloseTo(
        LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAYOUT.curbOuterClearanceMeters,
        10,
      )
      expect(placement.position[1]).toBeCloseTo(
        ROAD_PLAN.groundElevation +
          NATURAL_ROAD_STYLE.carriageway.surfaceOffsetMeters +
          NATURAL_ROAD_STYLE.sidewalk.curbHeightMeters,
        12,
      )
      expect(
        naturalRoadSidewalkContainsFootprint(
          ROAD_PLAN,
          createLandrushZombieNightStreetLightpostBaseFootprint(
            placement.position,
            placement.rotationY,
          ),
        ),
      ).toBe(true)
    }
    for (let leftIndex = 0; leftIndex < placements.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < placements.length; rightIndex += 1) {
        const left = placements[leftIndex]!
        const right = placements[rightIndex]!
        expect(
          Math.hypot(left.position[0] - right.position[0], left.position[2] - right.position[2]),
        ).toBeGreaterThanOrEqual(LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAYOUT.minimumSpacingMeters)
      }
    }
    expect(new Set(placements.map(({ side }) => side))).toEqual(new Set([-1, 1]))
  })

  test('keeps isolated short road fragments out of the street-light density plan', () => {
    const shortRoadPlan = createNaturalRoadPlan({
      elevation: 0,
      perimeter: PERIMETER,
      quality: 'high',
      roads: [
        {
          ...ROADS[0]!,
          id: 'short-fragment',
          points: [
            { x: 0, z: 0 },
            {
              x: LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAYOUT.minimumRoadLengthMeters - 0.01,
              z: 0,
            },
          ],
        },
      ],
      seed: 'cala',
    })
    const placements = createLandrushZombieNightBeaconPlacements({
      quality: 'balanced',
      roadPlan: shortRoadPlan,
    })
    expect(placements).toEqual([])
  })

  test('excludes roads rendered as the island perimeter promenade', () => {
    const perimeterRoad: LandrushRoadSegment = {
      connectsParcelIds: ['parcel-edge'],
      fromNodeId: 'perimeter-south',
      id: 'perimeter-promenade-source',
      kind: 'spine',
      points: [
        { x: -32, z: -16 },
        { x: -32, z: 16 },
      ],
      r3fPoints: [
        [-32, 0, -16],
        [-32, 0, 16],
      ],
      toNodeId: 'perimeter-north',
      width: 2.15,
    }
    const roadPlan = createNaturalRoadPlan({
      elevation: 0,
      perimeter: PERIMETER,
      quality: 'high',
      roads: [ROADS[0]!, perimeterRoad],
      seed: 'cala',
    })
    expect(roadPlan.perimeterSidewalkRoadIds).toContain(perimeterRoad.id)
    const placements = createLandrushZombieNightBeaconPlacements({
      quality: 'balanced',
      roadPlan,
    })
    expect(placements.length).toBeGreaterThan(0)
    expect(placements.every(({ roadId }) => roadId !== perimeterRoad.id)).toBe(true)
  })

  test('rejects a center-only false positive beyond a rendered sidewalk end cap', () => {
    const road = {
      ...ROADS[0]!,
      id: 'end-cap-road',
      points: [
        { x: -5, z: 0 },
        { x: 5, z: 0 },
      ],
    }
    const roadPlan = createNaturalRoadPlan({
      elevation: 0,
      perimeter: PERIMETER,
      quality: 'high',
      roads: [road],
      seed: 'cala',
    })
    const position = [
      5.2,
      NATURAL_ROAD_STYLE.carriageway.surfaceOffsetMeters +
        NATURAL_ROAD_STYLE.sidewalk.curbHeightMeters,
      -(
        LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAYOUT.carriagewayHalfWidthMeters +
        LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAYOUT.sidewalkWidthMeters -
        LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAYOUT.baseCrossRoadHalfWidthMeters -
        LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAYOUT.curbOuterClearanceMeters
      ),
    ] as const
    const centerDistance = distanceToOpenPolyline({ x: position[0], z: position[2] }, road.points)
    expect(
      centerDistance - LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_BASE_CROSS_ROAD_HALF_WIDTH_METERS,
    ).toBeGreaterThan(NATURAL_ROAD_STYLE.carriageway.widthMeters / 2)
    expect(
      centerDistance + LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_BASE_CROSS_ROAD_HALF_WIDTH_METERS,
    ).toBeLessThan(
      NATURAL_ROAD_STYLE.carriageway.widthMeters / 2 + NATURAL_ROAD_STYLE.sidewalk.widthMeters,
    )
    expect(
      naturalRoadSidewalkContainsFootprint(
        roadPlan,
        createLandrushZombieNightStreetLightpostBaseFootprint(position, 0),
      ),
    ).toBe(false)
  })

  test('keeps beacon pulse deterministic and within the authored luminance band', () => {
    const first = resolveLandrushZombieNightBeaconPulse(2.75, 1.25)
    expect(resolveLandrushZombieNightBeaconPulse(2.75, 1.25)).toBe(first)
    expect(first).toBeGreaterThanOrEqual(0.96)
    expect(first).toBeLessThanOrEqual(1.04)
  })

  test('keeps day frames out of the beacon loop and settles only the first zero frame', () => {
    expect(resolveLandrushZombieNightBeaconFrameMode(false, 0)).toBe('idle')
    expect(resolveLandrushZombieNightBeaconFrameMode(false, 0.5)).toBe('animate')
    expect(resolveLandrushZombieNightBeaconFrameMode(true, 0)).toBe('settle')
  })

  test('classifies unlit grass and curbside material paths for direct night tinting', () => {
    expect(
      resolveLandrushZombieNightSurfaceRole({
        textureName: 'procedural-stylized-grass-final',
      }),
    ).toBe('grass-ground')
    expect(
      resolveLandrushZombieNightSurfaceRole({
        geometryAttributes: ['aFade', 'aStreamFade', 'aVariation', 'position'],
      }),
    ).toBe('grass-blades')
    expect(resolveLandrushZombieNightSurfaceRole({ objectName: 'natural-road-sidewalks' })).toBe(
      'curbside',
    )
    expect(resolveLandrushZombieNightSurfaceRole({ objectName: 'player-robot' })).toBeNull()
  })

  test('declares observable no-post and determinism invariants', () => {
    expect(LANDRUSH_ZOMBIE_NIGHT_VISUAL_CONTRACT.invariants).toContain(
      'Zombies, roads, and the player remain readable with additive halos disabled.',
    )
    expect(LANDRUSH_ZOMBIE_NIGHT_VISUAL_CONTRACT.invariants).toContain(
      'The day-to-night envelope is frame-rate independent.',
    )
    expect(LANDRUSH_ZOMBIE_NIGHT_VISUAL_CONTRACT.invariants).toContain(
      'Ground grass, grass blades, and curbsides share the same monotonic night envelope.',
    )
  })
})

function distanceToOpenPolyline(
  point: { x: number; z: number },
  points: readonly { x: number; z: number }[],
) {
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!
    const end = points[index + 1]!
    const dx = end.x - start.x
    const dz = end.z - start.z
    const denominator = dx * dx + dz * dz
    const amount = Math.max(
      0,
      Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / (denominator || 1)),
    )
    best = Math.min(
      best,
      Math.hypot(point.x - (start.x + dx * amount), point.z - (start.z + dz * amount)),
    )
  }
  return best
}
