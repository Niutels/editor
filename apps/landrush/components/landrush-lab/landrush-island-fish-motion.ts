import { openPointRing, pointInPolygon } from '@landrush/runtime'
import type { LandrushPoint2 } from '@/components/landrush/types'

const SHORE_SAMPLE_SPACING_METERS = 1.1

export const LANDRUSH_ISLAND_FISH_LANE_COUNT_PER_SPECIES = 2

export type LandrushIslandFishMotionConfig = {
  cruiseSpeedMetersPerSecond: number
  depthMaxMeters: number
  depthMinMeters: number
  id: string
  modelForwardAxis: '+x' | '+z' | '-x' | '-z'
  modelForwardYaw: number
  shoreDistanceMaxMeters: number
  shoreDistanceMinMeters: number
}

export type LandrushIslandFishLane = {
  cumulativeLengths: readonly number[]
  id: string
  points: readonly LandrushPoint2[]
  targetShoreDistanceMeters: number
  totalLengthMeters: number
}

export type LandrushIslandFishTrajectory = {
  depthMeters: number
  direction: 1 | -1
  id: string
  lane: LandrushIslandFishLane
  laneIndex: number
  minimumShoreDistanceMeters: number
  maximumShoreDistanceMeters: number
  phaseDistanceMeters: number
  speedMetersPerSecond: number
  verticalAmplitudeMeters: number
  verticalFrequencyRadiansPerSecond: number
  verticalPhase: number
}

export type LandrushIslandFishMotionSample = {
  bankRadians: number
  forwardX: number
  forwardZ: number
  position: { x: number; y: number; z: number }
  speedMetersPerSecond: number
  trajectoryId: string
  yawRadians: number
}

export function createLandrushIslandFishLanes(
  config: LandrushIslandFishMotionConfig,
  shoreline: readonly LandrushPoint2[],
  center: LandrushPoint2,
  speciesIndex: number,
): readonly LandrushIslandFishLane[] {
  const denseShoreline = resampleClosedPolyline(shoreline, SHORE_SAMPLE_SPACING_METERS)
  return Array.from({ length: LANDRUSH_ISLAND_FISH_LANE_COUNT_PER_SPECIES }, (_, laneIndex) =>
    createLandrushIslandFishLane(
      config,
      shoreline,
      denseShoreline,
      center,
      speciesIndex,
      laneIndex,
    ),
  )
}

function createLandrushIslandFishLane(
  config: LandrushIslandFishMotionConfig,
  shoreline: readonly LandrushPoint2[],
  denseShoreline: readonly LandrushPoint2[],
  center: LandrushPoint2,
  speciesIndex: number,
  laneIndex: number,
): LandrushIslandFishLane {
  const shoreRange = config.shoreDistanceMaxMeters - config.shoreDistanceMinMeters
  const laneProgress = laneIndex / (LANDRUSH_ISLAND_FISH_LANE_COUNT_PER_SPECIES - 1)
  const targetShoreDistanceMeters =
    config.shoreDistanceMinMeters + shoreRange * (0.24 + laneProgress * 0.52)
  const offsetPoints = denseShoreline.map((point) => {
    const radial = normalizePoint(point.x - center.x, point.z - center.z)
    return fitPointToShoreDistance(
      {
        x: point.x + radial.x * targetShoreDistanceMeters,
        z: point.z + radial.z * targetShoreDistanceMeters,
      },
      shoreline,
      center,
      targetShoreDistanceMeters,
    )
  })
  const points = smoothClosedPath(offsetPoints, 2).map((point) =>
    fitPointToShoreDistance(point, shoreline, center, targetShoreDistanceMeters),
  )
  const cumulativeLengths = [0]
  let totalLengthMeters = 0
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    if (!(start && end)) continue
    totalLengthMeters += Math.hypot(end.x - start.x, end.z - start.z)
    cumulativeLengths.push(totalLengthMeters)
  }
  return {
    cumulativeLengths,
    id: `${config.id}:${speciesIndex}:lane:${laneIndex}`,
    points,
    targetShoreDistanceMeters,
    totalLengthMeters,
  }
}

export function createLandrushIslandFishTrajectory(
  config: LandrushIslandFishMotionConfig,
  lanes: readonly LandrushIslandFishLane[],
  speciesIndex: number,
  instanceIndex: number,
): LandrushIslandFishTrajectory {
  const seed = `${config.id}:${speciesIndex}:${instanceIndex}`
  const laneIndex = instanceIndex % lanes.length
  const lane = lanes[laneIndex]
  if (!lane) throw new Error(`Fish ${config.id} requires at least one motion lane.`)
  const speedMetersPerSecond =
    config.cruiseSpeedMetersPerSecond * (0.86 + hashUnit(`${seed}:speed`) * 0.28) +
    instanceIndex * 0.000_31
  const depthMeters =
    config.depthMinMeters +
    (config.depthMaxMeters - config.depthMinMeters) * hashUnit(`${seed}:depth`)

  return {
    depthMeters,
    direction: hashUnit(`${seed}:direction`) < 0.5 ? -1 : 1,
    id: `${config.id}:${instanceIndex}:${lane.targetShoreDistanceMeters.toFixed(3)}`,
    lane,
    laneIndex,
    maximumShoreDistanceMeters: config.shoreDistanceMaxMeters,
    minimumShoreDistanceMeters: config.shoreDistanceMinMeters,
    phaseDistanceMeters: lane.totalLengthMeters * hashUnit(`${seed}:phase`),
    speedMetersPerSecond,
    verticalAmplitudeMeters: 0.05 + hashUnit(`${seed}:vertical-amplitude`) * 0.12,
    verticalFrequencyRadiansPerSecond: 0.32 + hashUnit(`${seed}:vertical-frequency`) * 0.38,
    verticalPhase: hashUnit(`${seed}:vertical-phase`) * Math.PI * 2,
  }
}

export function sampleLandrushIslandFishMotion(
  trajectory: LandrushIslandFishTrajectory,
  elapsedSeconds: number,
  waterY: number,
): LandrushIslandFishMotionSample {
  const pathDistance = positiveModulo(
    trajectory.phaseDistanceMeters +
      elapsedSeconds * trajectory.speedMetersPerSecond * trajectory.direction,
    trajectory.lane.totalLengthMeters,
  )
  const point = sampleClosedPath(trajectory.lane, pathDistance)
  const lookAheadDistance = Math.max(0.08, trajectory.speedMetersPerSecond * 0.4)
  const ahead = sampleClosedPath(
    trajectory.lane,
    positiveModulo(
      pathDistance + lookAheadDistance * trajectory.direction,
      trajectory.lane.totalLengthMeters,
    ),
  )
  const forward = normalizePoint(ahead.x - point.x, ahead.z - point.z)
  const verticalPhase =
    elapsedSeconds * trajectory.verticalFrequencyRadiansPerSecond + trajectory.verticalPhase
  return {
    bankRadians: Math.sin(verticalPhase * 0.73) * 0.028,
    forwardX: forward.x,
    forwardZ: forward.z,
    position: {
      x: point.x,
      y:
        waterY -
        trajectory.depthMeters +
        Math.sin(verticalPhase) * trajectory.verticalAmplitudeMeters,
      z: point.z,
    },
    speedMetersPerSecond: trajectory.speedMetersPerSecond,
    trajectoryId: trajectory.id,
    yawRadians: Math.atan2(forward.x, forward.z),
  }
}

export function measureLandrushIslandFishShoreDistance(
  point: LandrushPoint2,
  shoreline: readonly LandrushPoint2[],
) {
  return distanceToLandrushIslandShoreline(point, shoreline)
}

export function distanceToLandrushIslandShoreline(
  point: LandrushPoint2,
  shoreline: readonly LandrushPoint2[],
) {
  let distance = Number.POSITIVE_INFINITY
  const ring = openPointRing(shoreline)
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index]
    const end = ring[(index + 1) % ring.length]
    if (start && end) distance = Math.min(distance, distanceToSegment(point, start, end))
  }
  return distance
}

function fitPointToShoreDistance(
  initial: LandrushPoint2,
  shoreline: readonly LandrushPoint2[],
  center: LandrushPoint2,
  targetDistance: number,
) {
  const radial = normalizePoint(initial.x - center.x, initial.z - center.z)
  let point = { ...initial }
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const actualDistance = distanceToLandrushIslandShoreline(point, shoreline)
    const inside = pointInPolygon(point, shoreline)
    const error = targetDistance - actualDistance
    if (!inside && Math.abs(error) <= Math.max(0.05, targetDistance * 0.025)) break
    const correction = inside
      ? Math.max(0.2, targetDistance - actualDistance + 0.1)
      : Math.max(-targetDistance * 0.25, Math.min(targetDistance * 0.25, error * 0.75))
    point = {
      x: point.x + radial.x * correction,
      z: point.z + radial.z * correction,
    }
  }
  return point
}

function resampleClosedPolyline(points: readonly LandrushPoint2[], spacing: number) {
  const result: LandrushPoint2[] = []
  const ring = openPointRing(points)
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index]
    const end = ring[(index + 1) % ring.length]
    if (!(start && end)) continue
    const length = Math.hypot(end.x - start.x, end.z - start.z)
    const steps = Math.max(1, Math.ceil(length / spacing))
    for (let step = 0; step < steps; step += 1) {
      const progress = step / steps
      result.push({
        x: start.x + (end.x - start.x) * progress,
        z: start.z + (end.z - start.z) * progress,
      })
    }
  }
  return result
}

function smoothClosedPath(points: readonly LandrushPoint2[], iterations: number) {
  let current = [...points]
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next: LandrushPoint2[] = []
    for (let index = 0; index < current.length; index += 1) {
      const first = current[index]
      const second = current[(index + 1) % current.length]
      if (!(first && second)) continue
      next.push(
        { x: first.x * 0.75 + second.x * 0.25, z: first.z * 0.75 + second.z * 0.25 },
        { x: first.x * 0.25 + second.x * 0.75, z: first.z * 0.25 + second.z * 0.75 },
      )
    }
    current = next
  }
  return current
}

function sampleClosedPath(lane: LandrushIslandFishLane, distance: number) {
  const segmentIndex = findSegmentIndex(lane.cumulativeLengths, distance)
  const start = lane.points[segmentIndex]
  const end = lane.points[(segmentIndex + 1) % lane.points.length]
  if (!(start && end)) return { x: 0, z: 0 }
  const segmentStart = lane.cumulativeLengths[segmentIndex] ?? 0
  const segmentEnd = lane.cumulativeLengths[segmentIndex + 1] ?? lane.totalLengthMeters
  const segmentLength = Math.max(0.000_001, segmentEnd - segmentStart)
  const progress = (distance - segmentStart) / segmentLength
  return {
    x: start.x + (end.x - start.x) * progress,
    z: start.z + (end.z - start.z) * progress,
  }
}

function findSegmentIndex(cumulativeLengths: readonly number[], distance: number) {
  let low = 0
  let high = Math.max(0, cumulativeLengths.length - 2)
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const start = cumulativeLengths[middle] ?? 0
    const end = cumulativeLengths[middle + 1] ?? Number.POSITIVE_INFINITY
    if (distance < start) high = middle - 1
    else if (distance >= end) low = middle + 1
    else return middle
  }
  return Math.max(0, Math.min(cumulativeLengths.length - 2, low))
}

function distanceToSegment(point: LandrushPoint2, start: LandrushPoint2, end: LandrushPoint2) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared <= 0.000_001) return Math.hypot(point.x - start.x, point.z - start.z)
  const progress = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared),
  )
  return Math.hypot(point.x - (start.x + dx * progress), point.z - (start.z + dz * progress))
}

function normalizePoint(x: number, z: number) {
  const length = Math.hypot(x, z)
  return length <= 0.000_001 ? { x: 0, z: 1 } : { x: x / length, z: z / length }
}

function positiveModulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus
}

function hashUnit(value: string) {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0) / 4_294_967_296
}
