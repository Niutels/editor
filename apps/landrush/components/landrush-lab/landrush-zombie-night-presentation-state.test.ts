import { describe, expect, test } from 'bun:test'
import type { LandrushRoadSegment } from '@/components/landrush/types'
import {
  advanceLandrushZombieNightAmount,
  createLandrushZombieNightBeaconPlacements,
  LANDRUSH_ZOMBIE_NIGHT_BASE_EXPOSURE,
  LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS,
  LANDRUSH_ZOMBIE_NIGHT_CPU_PRESENTATION_INTERVAL_SECONDS,
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
  shouldApplyLandrushZombieNightCpuPresentation,
  shouldPublishLandrushZombieNightDebugSnapshot,
} from './landrush-zombie-night-presentation-state'
import { resolveLandrushZombieNightStreetLightpostYaw } from './landrush-zombie-night-street-lightpost'

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
      groundY: 1.25,
      quality: 'balanced',
      roads: ROADS,
    })
    const replay = createLandrushZombieNightBeaconPlacements({
      groundY: 1.25,
      quality: 'balanced',
      roads: ROADS,
    })
    const low = createLandrushZombieNightBeaconPlacements({
      groundY: 1.25,
      quality: 'low',
      roads: ROADS,
    })
    expect(balanced).toEqual(replay)
    expect(balanced).toHaveLength(6)
    expect(low).toHaveLength(3)
    expect(new Set(balanced.map(({ id }) => id)).size).toBe(balanced.length)
    expect(
      balanced.every(({ phase, position, rotationY }) =>
        [phase, rotationY, ...position].every((value) => Number.isFinite(value)),
      ),
    ).toBe(true)
  })

  test('aims each overhanging lamp arm from its curb side back toward the road', () => {
    expect(resolveLandrushZombieNightStreetLightpostYaw(1, 0, -1)).toBeCloseTo(0, 12)
    expect(Math.abs(resolveLandrushZombieNightStreetLightpostYaw(1, 0, 1))).toBeCloseTo(Math.PI, 12)
    expect(resolveLandrushZombieNightStreetLightpostYaw(0, 1, 1)).toBeCloseTo(Math.PI / 2, 12)
  })

  test('replaces the center beacon when spare candidates preserve the quality count', () => {
    const allCandidates = createLandrushZombieNightBeaconPlacements({
      groundY: 1.25,
      quality: 'balanced',
      roads: ROADS,
    })
    const roadPoints = ROADS.flatMap((road) => road.points)
    const center = roadPoints.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), {
      x: 0,
      z: 0,
    })
    center.x /= roadPoints.length
    center.z /= roadPoints.length
    const nearestCenterCandidate = [...allCandidates].sort((left, right) => {
      const leftDistance = (left.position[0] - center.x) ** 2 + (left.position[2] - center.z) ** 2
      const rightDistance =
        (right.position[0] - center.x) ** 2 + (right.position[2] - center.z) ** 2
      return leftDistance - rightDistance || left.id.localeCompare(right.id)
    })[0]!
    const low = createLandrushZombieNightBeaconPlacements({
      groundY: 1.25,
      quality: 'low',
      roads: ROADS,
    })

    expect(allCandidates).toHaveLength(LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS.balanced)
    expect(low).toHaveLength(LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS.low)
    expect(low.map(({ id }) => id)).not.toContain(nearestCenterCandidate.id)
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
