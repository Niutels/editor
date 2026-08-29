import { describe, expect, test } from 'bun:test'
import type { GrassFieldBlocker } from './grass-field-texture'
import {
  createLandrushIslandConstructionBlockedPalmInstanceIndices,
  LANDRUSH_ISLAND_PALM_CONSTRUCTION_CLEARANCE_METERS,
  resolveLandrushIslandAmbientPalmSlotVisible,
} from './landrush-island-palm-construction-visibility'
import type { LandrushIslandPalmPlacement } from './landrush-island-palm-layout'

const SQUARE = [
  { x: -1, z: -1 },
  { x: 1, z: -1 },
  { x: 1, z: 1 },
  { x: -1, z: 1 },
]

function placement(instanceIndex: number, x: number, z = 0): LandrushIslandPalmPlacement {
  return {
    catalogIndex: instanceIndex % 3,
    heightMeters: 8,
    id: `palm:${String(instanceIndex)}`,
    instanceIndex,
    position: { x, z },
    trunkRadiusMeters: 0.9,
  }
}

function blockedIndices(
  layout: readonly LandrushIslandPalmPlacement[],
  blocker: GrassFieldBlocker,
) {
  return createLandrushIslandConstructionBlockedPalmInstanceIndices({
    blockers: [blocker],
    layout,
  })
}

describe('Landrush island palm construction visibility', () => {
  test('restores the exact committed and active construction clearances without trunk inflation', () => {
    const committedClearance = 1 + LANDRUSH_ISLAND_PALM_CONSTRUCTION_CLEARANCE_METERS
    const activeClearance = LANDRUSH_ISLAND_PALM_CONSTRUCTION_CLEARANCE_METERS
    const layout = [
      placement(2, 1 + committedClearance),
      placement(7, 1 + committedClearance + 0.000_001),
    ]

    expect(
      blockedIndices(layout, {
        clearanceMeters: 1,
        featherMeters: 900,
        initialVisibility: 0,
        points: SQUARE,
      }),
    ).toEqual(new Set([2]))
    expect(
      blockedIndices(
        [placement(11, 1 + activeClearance), placement(15, 1 + activeClearance + 0.000_001)],
        { points: SQUARE },
      ),
    ).toEqual(new Set([11]))
  })

  test('blocks inside, boundary, reversed-ring, and tangent positions but ignores degenerate rings', () => {
    const layout = [placement(1, 0), placement(4, 1), placement(9, 0, 3.35)]
    const reversed = [...SQUARE].reverse()

    expect(blockedIndices(layout, { clearanceMeters: 0, points: reversed })).toEqual(
      new Set([1, 4, 9]),
    )
    expect(blockedIndices(layout, { points: SQUARE.slice(0, 2) })).toEqual(new Set())
  })

  test('preserves sparse catalog identities and restores the same palms after blocker removal', () => {
    const layout = [placement(2, -6), placement(9, 0), placement(17, 6)]
    const before = createLandrushIslandConstructionBlockedPalmInstanceIndices({
      blockers: [],
      layout,
    })
    const during = blockedIndices(layout, { points: SQUARE })
    const after = createLandrushIslandConstructionBlockedPalmInstanceIndices({
      blockers: [],
      layout,
    })

    expect(before).toEqual(new Set())
    expect(during).toEqual(new Set([9]))
    expect(after).toEqual(new Set())
    expect(layout.map((entry) => entry.instanceIndex)).toEqual([2, 9, 17])
  })

  test('combines phase and construction visibility without changing mounted slot identity', () => {
    const blockedInstanceIndices = new Set([7])
    expect(
      resolveLandrushIslandAmbientPalmSlotVisible({
        blockedInstanceIndices,
        instanceIndex: 7,
        phaseVisible: true,
      }),
    ).toBe(false)
    expect(
      resolveLandrushIslandAmbientPalmSlotVisible({
        blockedInstanceIndices,
        instanceIndex: 8,
        phaseVisible: false,
      }),
    ).toBe(false)
    expect(
      resolveLandrushIslandAmbientPalmSlotVisible({
        blockedInstanceIndices,
        instanceIndex: 8,
        phaseVisible: true,
      }),
    ).toBe(true)
  })
})
