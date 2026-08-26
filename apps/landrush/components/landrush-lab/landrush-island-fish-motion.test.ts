import { describe, expect, test } from 'bun:test'
import {
  LANDRUSH_ISLAND_AMBIENT_FISH,
  LANDRUSH_ISLAND_AMBIENT_FISH_INSTANCE_COUNT,
} from './landrush-island-ambient-catalog'
import {
  createLandrushIslandFishLanes,
  createLandrushIslandFishMotionSample,
  createLandrushIslandFishMotionScratch,
  createLandrushIslandFishTrajectory,
  LANDRUSH_ISLAND_FISH_LANE_COUNT_PER_SPECIES,
  measureLandrushIslandFishShoreDistance,
  sampleLandrushIslandFishMotion,
  sampleLandrushIslandFishMotionInto,
} from './landrush-island-fish-motion'

const center = { x: 0, z: 0 }
const shoreline = Array.from({ length: 96 }, (_, index) => {
  const angle = (index / 96) * Math.PI * 2
  return { x: Math.cos(angle) * 20, z: Math.sin(angle) * 20 }
})
const sampleTimes = [0, 0.5, 2, 8, 30, 75]

function createFishSchools() {
  return LANDRUSH_ISLAND_AMBIENT_FISH.map((fish, speciesIndex) => {
    const lanes = createLandrushIslandFishLanes(fish, shoreline, center, speciesIndex)
    return {
      fish,
      lanes,
      trajectories: Array.from({ length: fish.schoolSize }, (_, schoolIndex) =>
        createLandrushIslandFishTrajectory(fish, lanes, speciesIndex, schoolIndex),
      ),
    }
  })
}

const schools = createFishSchools()

describe('Landrush island fish motion contracts', () => {
  test('builds a fixed number of shared lane geometries rather than one path per fish', () => {
    const lanes = schools.flatMap((school) => school.lanes)
    const trajectories = schools.flatMap((school) => school.trajectories)
    const expectedLaneCount =
      LANDRUSH_ISLAND_AMBIENT_FISH.length * LANDRUSH_ISLAND_FISH_LANE_COUNT_PER_SPECIES

    expect(lanes).toHaveLength(expectedLaneCount)
    expect(expectedLaneCount).toBeLessThan(LANDRUSH_ISLAND_AMBIENT_FISH_INSTANCE_COUNT)
    expect(new Set(trajectories.map((trajectory) => trajectory.lane)).size).toBe(expectedLaneCount)
    expect(new Set(trajectories.map((trajectory) => trajectory.lane.points)).size).toBe(
      expectedLaneCount,
    )

    for (const school of schools) {
      expect(school.lanes).toHaveLength(LANDRUSH_ISLAND_FISH_LANE_COUNT_PER_SPECIES)
      expect(new Set(school.trajectories.map((trajectory) => trajectory.lane)).size).toBe(
        LANDRUSH_ISLAND_FISH_LANE_COUNT_PER_SPECIES,
      )
      expect(
        new Set(school.lanes.map((lane) => lane.targetShoreDistanceMeters.toFixed(7))).size,
      ).toBe(LANDRUSH_ISLAND_FISH_LANE_COUNT_PER_SPECIES)
      expect(
        new Set(school.trajectories.map((trajectory) => trajectory.phaseDistanceMeters.toFixed(7)))
          .size,
      ).toBe(school.trajectories.length)
      expect(
        new Set(school.trajectories.map((trajectory) => trajectory.depthMeters.toFixed(7))).size,
      ).toBe(school.trajectories.length)

      for (const [schoolIndex, trajectory] of school.trajectories.entries()) {
        const expectedLaneIndex = schoolIndex % LANDRUSH_ISLAND_FISH_LANE_COUNT_PER_SPECIES
        expect(trajectory.laneIndex).toBe(expectedLaneIndex)
        expect(trajectory.lane).toBe(school.lanes[expectedLaneIndex])
        expect('shoreline' in trajectory.lane).toBe(false)
      }
    }
  })

  test('recreates lane geometry and per-fish motion deterministically', () => {
    const fish = LANDRUSH_ISLAND_AMBIENT_FISH[0]
    if (!fish) throw new Error('Expected the ambient fish catalog to contain a species.')
    const firstLanes = createLandrushIslandFishLanes(fish, shoreline, center, 0)
    const repeatedLanes = createLandrushIslandFishLanes(fish, shoreline, center, 0)
    expect(repeatedLanes).toEqual(firstLanes)

    for (let schoolIndex = 0; schoolIndex < fish.schoolSize; schoolIndex += 1) {
      const first = createLandrushIslandFishTrajectory(fish, firstLanes, 0, schoolIndex)
      const repeated = createLandrushIslandFishTrajectory(fish, repeatedLanes, 0, schoolIndex)
      expect(repeated).toEqual(first)
      for (const time of sampleTimes) {
        expect(sampleLandrushIslandFishMotion(repeated, time, 2)).toEqual(
          sampleLandrushIslandFishMotion(first, time, 2),
        )
      }
    }
  })

  test('samples into stable storage without replacing per-frame objects', () => {
    const school = schools[0]
    const trajectory = school?.trajectories[0]
    if (!trajectory) throw new Error('Expected a fish trajectory.')
    const target = createLandrushIslandFishMotionSample()
    const targetPosition = target.position
    const scratch = createLandrushIslandFishMotionScratch()
    const scratchAhead = scratch.ahead

    for (const time of sampleTimes) {
      const expected = sampleLandrushIslandFishMotion(trajectory, time, 2)
      expect(sampleLandrushIslandFishMotionInto(trajectory, time, 2, target, scratch)).toBe(target)
      expect(target).toEqual(expected)
      expect(target.position).toBe(targetPosition)
      expect(scratch.ahead).toBe(scratchAhead)
    }
  })

  test('secures orientation, individual motion, and catalog envelopes', () => {
    const trajectories = schools.flatMap(({ fish, trajectories }) =>
      trajectories.map((trajectory) => ({ fish, trajectory })),
    )

    expect(trajectories).toHaveLength(LANDRUSH_ISLAND_AMBIENT_FISH_INSTANCE_COUNT)
    expect(new Set(trajectories.map(({ trajectory }) => trajectory.id)).size).toBe(
      LANDRUSH_ISLAND_AMBIENT_FISH_INSTANCE_COUNT,
    )
    expect(
      new Set(trajectories.map(({ trajectory }) => trajectory.speedMetersPerSecond.toFixed(7)))
        .size,
    ).toBe(LANDRUSH_ISLAND_AMBIENT_FISH_INSTANCE_COUNT)

    for (const { fish, trajectory } of trajectories) {
      expect(trajectory.depthMeters).toBeGreaterThanOrEqual(fish.depthMinMeters)
      expect(trajectory.depthMeters).toBeLessThanOrEqual(fish.depthMaxMeters)
      expect(trajectory.phaseDistanceMeters).toBeGreaterThanOrEqual(0)
      expect(trajectory.phaseDistanceMeters).toBeLessThan(trajectory.lane.totalLengthMeters)
      for (const time of sampleTimes) {
        const sample = sampleLandrushIslandFishMotion(trajectory, time, 2)
        const repeated = sampleLandrushIslandFishMotion(trajectory, time, 2)
        expect(repeated).toEqual(sample)
        expect('shoreDistanceMeters' in sample).toBe(false)

        const modelHeadingYaw = sample.yawRadians + fish.modelForwardYaw
        const localForward = fishModelForwardVector(fish.modelForwardAxis)
        const modelForwardX =
          Math.cos(modelHeadingYaw) * localForward.x + Math.sin(modelHeadingYaw) * localForward.z
        const modelForwardZ =
          -Math.sin(modelHeadingYaw) * localForward.x + Math.cos(modelHeadingYaw) * localForward.z
        expect(modelForwardX * sample.forwardX + modelForwardZ * sample.forwardZ).toBeCloseTo(1, 10)
        const shoreDistance = measureLandrushIslandFishShoreDistance(sample.position, shoreline)
        expect(shoreDistance).toBeGreaterThanOrEqual(fish.shoreDistanceMinMeters)
        expect(shoreDistance).toBeLessThanOrEqual(fish.shoreDistanceMaxMeters)
        expect(sample.position.y).toBeGreaterThanOrEqual(
          2 - trajectory.depthMeters - trajectory.verticalAmplitudeMeters,
        )
        expect(sample.position.y).toBeLessThanOrEqual(
          2 - trajectory.depthMeters + trajectory.verticalAmplitudeMeters,
        )

        const next = sampleLandrushIslandFishMotion(trajectory, time + 0.02, 2)
        const measuredSpeed =
          Math.hypot(next.position.x - sample.position.x, next.position.z - sample.position.z) /
          0.02
        expect(measuredSpeed).toBeCloseTo(trajectory.speedMetersPerSecond, 2)
      }

      const first = sampleLandrushIslandFishMotion(trajectory, 0, 2)
      const later = sampleLandrushIslandFishMotion(trajectory, 4, 2)
      expect(
        Math.hypot(later.position.x - first.position.x, later.position.z - first.position.z),
      ).toBeGreaterThan(0.25)
    }
  })
})

function fishModelForwardVector(axis: '+x' | '+z' | '-x' | '-z') {
  if (axis === '+x') return { x: 1, z: 0 }
  if (axis === '-x') return { x: -1, z: 0 }
  if (axis === '-z') return { x: 0, z: -1 }
  return { x: 0, z: 1 }
}
