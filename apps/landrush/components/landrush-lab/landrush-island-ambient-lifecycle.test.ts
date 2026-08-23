import { describe, expect, test } from 'bun:test'
import {
  LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
  LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
  LANDRUSH_ISLAND_AMBIENT_PALMS,
} from './landrush-island-ambient-catalog'
import {
  parseLandrushIslandAmbientMotionDebugSettings,
  resolveAdmittedLandrushIslandAmbientNavigationObstacles,
  resolveLandrushIslandAmbientNpcPalmCollisions,
  resolveLandrushIslandAmbientPalmPosition,
  resolveLandrushIslandAmbientPalmSlots,
} from './landrush-island-ambient-lifecycle'
import type { LandrushIslandAmbientNavigationObstacle } from './landrush-island-ambient-navigation'

const sceneObstacle: LandrushIslandAmbientNavigationObstacle = {
  id: 'scene:house',
  points: [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 1, z: 1 },
    { x: 0, z: 1 },
  ],
}
const palmObstacle: LandrushIslandAmbientNavigationObstacle = {
  id: 'palm:0',
  points: [
    { x: 2, z: 2 },
    { x: 3, z: 2 },
    { x: 3, z: 3 },
    { x: 2, z: 3 },
  ],
}

describe('Landrush island ambient lifecycle', () => {
  test('does not extract scene obstacles until ambient life is admitted', () => {
    let extractionCount = 0
    const createSceneObstacles = () => {
      extractionCount += 1
      return [sceneObstacle]
    }

    const beforeAdmission = resolveAdmittedLandrushIslandAmbientNavigationObstacles({
      admitted: false,
      createSceneObstacles,
      palmObstacles: [palmObstacle],
    })
    expect(beforeAdmission).toEqual([])
    expect(extractionCount).toBe(0)

    const afterAdmission = resolveAdmittedLandrushIslandAmbientNavigationObstacles({
      admitted: true,
      createSceneObstacles,
      palmObstacles: [palmObstacle],
    })
    expect(afterAdmission).toEqual([sceneObstacle, palmObstacle])
    expect(extractionCount).toBe(1)
  })

  test('parses debug recording and fixed fish time from one query snapshot', () => {
    expect(
      parseLandrushIslandAmbientMotionDebugSettings('?ambientMotionDebug=1&ambientMotionTime=12.5'),
    ).toEqual({ enabled: true, timeSeconds: 12.5 })
    expect(parseLandrushIslandAmbientMotionDebugSettings('?ambientMotionTime=-1')).toEqual({
      enabled: false,
      timeSeconds: null,
    })
    expect(parseLandrushIslandAmbientMotionDebugSettings('?ambientMotionTime=invalid')).toEqual({
      enabled: false,
      timeSeconds: null,
    })
  })

  test('keeps all palm slots and keys stable while visibility expands from four to twenty-four', () => {
    const daySlots = resolveSlots(false)
    const zombieSlots = resolveSlots(true)

    expect(daySlots).toHaveLength(LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT)
    expect(zombieSlots).toHaveLength(LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT)
    expect(daySlots.map((slot) => slot.instanceIndex).sort((a, b) => a - b)).toEqual(
      Array.from({ length: LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT }, (_, index) => index),
    )
    expect(zombieSlots.map((slot) => slot.instanceIndex)).toEqual(
      daySlots.map((slot) => slot.instanceIndex),
    )
    expect(daySlots.filter((slot) => slot.visible).map((slot) => slot.instanceIndex)).toEqual(
      Array.from({ length: LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT }, (_, index) => index),
    )
    expect(zombieSlots.every((slot) => slot.visible)).toBe(true)
  })

  test('preserves the four legacy day positions inside one phase-invariant twenty-four-slot layout', () => {
    const center = { x: 2, z: -3 }
    const shoreline = Array.from({ length: 32 }, (_, index) => ({
      x: index * 1.25 - 11,
      z: ((index * 7) % 13) * 0.8 - 4,
    }))
    const positions = Array.from(
      { length: LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT },
      (_, instanceIndex) =>
        resolveLandrushIslandAmbientPalmPosition({
          center,
          dayInstanceCount: LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
          instanceCount: LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
          instanceIndex,
          shoreline,
        }),
    )
    const legacyDayPositions = Array.from(
      { length: LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT },
      (_, instanceIndex) => {
        const point =
          shoreline[
            Math.floor(
              ((instanceIndex + 0.55) * shoreline.length) /
                LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
            ) % shoreline.length
          ]
        if (!point) return center
        return {
          x: center.x + (point.x - center.x) * 0.82,
          z: center.z + (point.z - center.z) * 0.82,
        }
      },
    )
    const positionsForPhase = (zombieIslandActive: boolean) =>
      resolveSlots(zombieIslandActive).map((slot) => positions[slot.instanceIndex])

    expect(positions.slice(0, LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT)).toEqual(
      legacyDayPositions,
    )
    expect(positionsForPhase(false)).toEqual(positionsForPhase(true))
  })

  test('keeps ambient NPC navigation on the four day-visible palm trunks across phases', () => {
    const physicalPalmCollisions = Array.from(
      { length: LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT },
      (_, index) => ({ id: `palm:${String(index)}` }),
    )

    const npcPalmCollisions = resolveLandrushIslandAmbientNpcPalmCollisions(
      physicalPalmCollisions,
      LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
    )

    expect(npcPalmCollisions.map((collision) => collision.id)).toEqual([
      'palm:0',
      'palm:1',
      'palm:2',
      'palm:3',
    ])
    expect(physicalPalmCollisions).toHaveLength(LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT)
  })
})

function resolveSlots(zombieIslandActive: boolean) {
  return Array.from({ length: LANDRUSH_ISLAND_AMBIENT_PALMS.length }, (_, catalogIndex) =>
    resolveLandrushIslandAmbientPalmSlots({
      catalogIndex,
      catalogSize: LANDRUSH_ISLAND_AMBIENT_PALMS.length,
      dayInstanceCount: LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
      instanceCount: LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
      zombieIslandActive,
    }),
  )
    .flat()
    .sort((first, second) => first.instanceIndex - second.instanceIndex)
}
