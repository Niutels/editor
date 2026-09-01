import type { LandrushPoint2, LandrushRoadSegment } from '@/components/landrush/types'
import type { GrassFieldBlocker } from './grass-field-texture'

export type LandrushIslandRockPlacement = Readonly<{
  clusterId: string
  id: string
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  scale: readonly [number, number, number]
  variant: 0 | 1 | 2
}>

export type LandrushIslandRockCluster = Readonly<{
  center: LandrushPoint2
  id: string
  rocks: readonly LandrushIslandRockPlacement[]
}>

export type LandrushIslandRockClusterLayout = Readonly<{
  clusters: readonly LandrushIslandRockCluster[]
  rocks: readonly LandrushIslandRockPlacement[]
  seed: number
}>

export const LANDRUSH_ISLAND_ROCK_CLUSTER_SEED = 0x72_6f_63_6b

export const LANDRUSH_ISLAND_ENVIRONMENT_CLEARANCE = Object.freeze({
  authoredBuildingGrassMeters: 1,
  buildingGrassScale: 0.7,
  resolvedBuildingGrassMeters: 0.7,
  rockGrassFeatherMeters: 0.1,
  rockGrassMeters: 0.175,
  rockToBuildingRatio: 0.25,
})

export const LANDRUSH_ISLAND_ROCK_CLUSTER_PLACEMENT = Object.freeze({
  blockerAvoidanceMeters: 1.6,
  candidateCellMeters: 5.5,
  maximumClusters: 12,
  minimumClusters: 6,
  minimumClusterSpacingMeters: 8.5,
  roadEdgeClearanceMeters: 1.8,
  shoreClearanceMeters: 3,
  targetAreaPerClusterSquareMeters: 320,
})

export const LANDRUSH_ISLAND_ROCK_CLUSTER_BUDGET = Object.freeze({
  maximumDrawCalls: 3,
  maximumInstances: 48,
  maximumTriangles: 1_728,
  trianglesPerInstance: 36,
  variants: 3,
})

const LANDRUSH_ISLAND_ROCK_HORIZONTAL_FOOTPRINT_SCALE = 1.12

export const EMPTY_LANDRUSH_ISLAND_ROCK_CLUSTER_LAYOUT: LandrushIslandRockClusterLayout =
  Object.freeze({
    clusters: Object.freeze([]),
    rocks: Object.freeze([]),
    seed: LANDRUSH_ISLAND_ROCK_CLUSTER_SEED,
  })

export function createLandrushIslandRockClusterLayout({
  blockers = [],
  elevation,
  perimeter,
  roadWidthScale = 1,
  roads,
  seed = LANDRUSH_ISLAND_ROCK_CLUSTER_SEED,
}: {
  blockers?: readonly GrassFieldBlocker[]
  elevation: number
  perimeter: readonly LandrushPoint2[]
  roadWidthScale?: number
  roads: readonly LandrushRoadSegment[]
  seed?: number
}): LandrushIslandRockClusterLayout {
  const ring = openRing(perimeter)
  if (ring.length < 3) return { ...EMPTY_LANDRUSH_ISLAND_ROCK_CLUSTER_LAYOUT, seed }
  const bounds = pointBounds(ring)
  const area = polygonArea(ring)
  const targetClusterCount = clampInteger(
    Math.round(area / LANDRUSH_ISLAND_ROCK_CLUSTER_PLACEMENT.targetAreaPerClusterSquareMeters),
    LANDRUSH_ISLAND_ROCK_CLUSTER_PLACEMENT.minimumClusters,
    LANDRUSH_ISLAND_ROCK_CLUSTER_PLACEMENT.maximumClusters,
  )
  const cellSize = LANDRUSH_ISLAND_ROCK_CLUSTER_PLACEMENT.candidateCellMeters
  const cellsX = Math.max(1, Math.ceil((bounds.maximumX - bounds.minimumX) / cellSize))
  const cellsZ = Math.max(1, Math.ceil((bounds.maximumZ - bounds.minimumZ) / cellSize))
  const resolvedRoadWidthScale = resolveRoadWidthScale(roadWidthScale)
  const candidates: Array<LandrushPoint2 & { id: string; priority: number }> = []

  for (let cellZ = 0; cellZ < cellsZ; cellZ += 1) {
    for (let cellX = 0; cellX < cellsX; cellX += 1) {
      const cellHash = mixHash(seed, mixHash(cellX + 1, cellZ + 1))
      const x =
        bounds.minimumX + (cellX + 0.5 + (hashUnit(cellHash, 0x2f_11) - 0.5) * 0.72) * cellSize
      const z =
        bounds.minimumZ + (cellZ + 0.5 + (hashUnit(cellHash, 0x71_a9) - 0.5) * 0.72) * cellSize
      const point = { x, z }
      if (!pointInPolygon(point, ring)) continue
      if (
        distanceToClosedPolyline(point, ring) <
        LANDRUSH_ISLAND_ROCK_CLUSTER_PLACEMENT.shoreClearanceMeters
      ) {
        continue
      }
      if (
        distanceToRoadEdges(point, roads, resolvedRoadWidthScale) <
        LANDRUSH_ISLAND_ROCK_CLUSTER_PLACEMENT.roadEdgeClearanceMeters
      ) {
        continue
      }
      if (
        distanceToBlockers(point, blockers) <
        LANDRUSH_ISLAND_ROCK_CLUSTER_PLACEMENT.blockerAvoidanceMeters
      ) {
        continue
      }
      candidates.push({
        id: `rock-cluster-${cellX}-${cellZ}`,
        priority: mixHash(cellHash, 0x43_a9_71),
        x,
        z,
      })
    }
  }

  const selected: Array<{
    candidate: (typeof candidates)[number]
    rocks: readonly LandrushIslandRockPlacement[]
  }> = []
  const minimumSpacingSquared =
    LANDRUSH_ISLAND_ROCK_CLUSTER_PLACEMENT.minimumClusterSpacingMeters ** 2
  let remainingInstanceBudget = LANDRUSH_ISLAND_ROCK_CLUSTER_BUDGET.maximumInstances
  for (const candidate of candidates.sort(
    (left, right) => right.priority - left.priority || left.id.localeCompare(right.id),
  )) {
    if (selected.length >= targetClusterCount) break
    if (
      selected.some(
        ({ candidate: other }) => pointDistanceSquared(candidate, other) < minimumSpacingSquared,
      )
    ) {
      continue
    }
    const clusterSeed = mixHash(seed, hashString(candidate.id))
    const desiredRockCount = 2 + (clusterSeed % 3)
    const rockCount = Math.min(desiredRockCount, remainingInstanceBudget)
    const rocks = Array.from({ length: rockCount }, (_, rockIndex) =>
      createRockPlacement({
        center: candidate,
        clusterId: candidate.id,
        clusterIndex: selected.length,
        elevation,
        rockIndex,
        seed: clusterSeed,
      }),
    )
    if (
      rocks.some(
        (rock) =>
          distanceToRoadEdges(rockPoint(rock), roads, resolvedRoadWidthScale) -
            landrushIslandRockHorizontalFootprintRadius(rock) <
          LANDRUSH_ISLAND_ROCK_CLUSTER_PLACEMENT.roadEdgeClearanceMeters,
      )
    ) {
      continue
    }
    selected.push({ candidate, rocks })
    remainingInstanceBudget -= rockCount
  }

  const clusters = selected.map(({ candidate, rocks }) => {
    return {
      center: { x: candidate.x, z: candidate.z },
      id: candidate.id,
      rocks,
    }
  })
  const rocks = clusters.flatMap((cluster) => cluster.rocks)
  return { clusters, rocks, seed }
}

export function resolveLandrushIslandVisibleRockClusterLayout({
  blockers,
  layout,
}: {
  blockers: readonly GrassFieldBlocker[]
  layout: LandrushIslandRockClusterLayout
}): LandrushIslandRockClusterLayout {
  if (blockers.length === 0 || layout.rocks.length === 0) return layout
  const visibleRocks = layout.rocks.filter((rock) => !rockOverlapsBlockers(rock, blockers))
  if (visibleRocks.length === layout.rocks.length) return layout

  const visibleRockIds = new Set(visibleRocks.map((rock) => rock.id))
  const clusters = layout.clusters.flatMap((cluster) => {
    const rocks = cluster.rocks.filter((rock) => visibleRockIds.has(rock.id))
    return rocks.length > 0 ? [{ ...cluster, rocks }] : []
  })
  return { ...layout, clusters, rocks: visibleRocks }
}

export function landrushIslandRockHorizontalFootprintRadius(rock: LandrushIslandRockPlacement) {
  return Math.max(...rock.scale) * LANDRUSH_ISLAND_ROCK_HORIZONTAL_FOOTPRINT_SCALE
}

export function createLandrushIslandRockGrassBlockers(
  layout: LandrushIslandRockClusterLayout,
): readonly GrassFieldBlocker[] {
  return layout.rocks.map((rock) => {
    const footprintRadius = Math.max(rock.scale[0], rock.scale[2]) * 0.86
    return {
      clearanceMeters: LANDRUSH_ISLAND_ENVIRONMENT_CLEARANCE.rockGrassMeters,
      featherMeters: LANDRUSH_ISLAND_ENVIRONMENT_CLEARANCE.rockGrassFeatherMeters,
      points: createRadialFootprint(
        rock.position[0],
        rock.position[2],
        footprintRadius,
        rock.rotation[1],
      ),
    }
  })
}

export function scaleLandrushIslandBuildingGrassClearance(
  blockers: readonly GrassFieldBlocker[],
): readonly GrassFieldBlocker[] {
  if (blockers.length === 0) return blockers
  return blockers.map((blocker) =>
    blocker.clearanceMeters === undefined
      ? blocker
      : {
          ...blocker,
          clearanceMeters:
            Math.max(0, blocker.clearanceMeters) *
            LANDRUSH_ISLAND_ENVIRONMENT_CLEARANCE.buildingGrassScale,
        },
  )
}

function createRockPlacement({
  center,
  clusterId,
  clusterIndex,
  elevation,
  rockIndex,
  seed,
}: {
  center: LandrushPoint2
  clusterId: string
  clusterIndex: number
  elevation: number
  rockIndex: number
  seed: number
}): LandrushIslandRockPlacement {
  const rockSeed = mixHash(seed, rockIndex + 1)
  const angle = hashUnit(rockSeed, 0x19_73) * Math.PI * 2
  const radialDistance = rockIndex === 0 ? 0.12 : 0.42 + hashUnit(rockSeed, 0xa3_31) * 0.58
  const baseScale = 0.42 + hashUnit(rockSeed, 0x61_0d) * 0.52
  const scaleX = baseScale * (0.78 + hashUnit(rockSeed, 0x1c_4f) * 0.42)
  const scaleY = baseScale * (0.62 + hashUnit(rockSeed, 0x83_15) * 0.48)
  const scaleZ = baseScale * (0.78 + hashUnit(rockSeed, 0x44_f3) * 0.42)
  const yaw = hashUnit(rockSeed, 0xe5_29) * Math.PI * 2
  const pitch = (hashUnit(rockSeed, 0x77_91) - 0.5) * 0.24
  const roll = (hashUnit(rockSeed, 0xb9_17) - 0.5) * 0.24
  return {
    clusterId,
    id: `${clusterId}-rock-${clusterIndex}-${rockIndex}`,
    position: [
      center.x + Math.cos(angle) * radialDistance,
      (Number.isFinite(elevation) ? elevation : 0) + scaleY * 0.72,
      center.z + Math.sin(angle) * radialDistance,
    ],
    rotation: [pitch, yaw, roll],
    scale: [scaleX, scaleY, scaleZ],
    variant: (mixHash(rockSeed, 0x39_5b) % 3) as 0 | 1 | 2,
  }
}

function createRadialFootprint(centerX: number, centerZ: number, radius: number, rotation: number) {
  return Array.from({ length: 8 }, (_, index) => {
    const angle = rotation + (index / 8) * Math.PI * 2
    return { x: centerX + Math.cos(angle) * radius, z: centerZ + Math.sin(angle) * radius }
  })
}

function rockPoint(rock: LandrushIslandRockPlacement): LandrushPoint2 {
  return { x: rock.position[0], z: rock.position[2] }
}

function rockOverlapsBlockers(
  rock: LandrushIslandRockPlacement,
  blockers: readonly GrassFieldBlocker[],
) {
  const point = rockPoint(rock)
  const radius = landrushIslandRockHorizontalFootprintRadius(rock)
  return blockers.some((blocker) => {
    const ring = openRing(blocker.points)
    return (
      ring.length >= 3 &&
      (pointInPolygon(point, ring) || distanceToClosedPolyline(point, ring) <= radius)
    )
  })
}

function distanceToRoadEdges(
  point: LandrushPoint2,
  roads: readonly LandrushRoadSegment[],
  widthScale: number,
) {
  let best = Number.POSITIVE_INFINITY
  for (const road of roads) {
    best = Math.min(
      best,
      distanceToOpenPolyline(point, road.points) - Math.max(0, road.width) * widthScale * 0.5,
    )
  }
  return best
}

function resolveRoadWidthScale(value: number) {
  return Number.isFinite(value) ? Math.max(0.01, value) : 1
}

function distanceToBlockers(point: LandrushPoint2, blockers: readonly GrassFieldBlocker[]) {
  let best = Number.POSITIVE_INFINITY
  for (const blocker of blockers) {
    const ring = openRing(blocker.points)
    if (ring.length < 3) continue
    const boundaryDistance = distanceToClosedPolyline(point, ring)
    const signedDistance = pointInPolygon(point, ring) ? -boundaryDistance : boundaryDistance
    best = Math.min(best, signedDistance - Math.max(0, blocker.clearanceMeters ?? 0))
  }
  return best
}

function openRing(points: readonly LandrushPoint2[]) {
  const first = points[0]
  const last = points.at(-1)
  return first && last && Math.hypot(first.x - last.x, first.z - last.z) <= 0.001
    ? points.slice(0, -1)
    : [...points]
}

function pointBounds(points: readonly LandrushPoint2[]) {
  return points.reduce(
    (bounds, point) => ({
      maximumX: Math.max(bounds.maximumX, point.x),
      maximumZ: Math.max(bounds.maximumZ, point.z),
      minimumX: Math.min(bounds.minimumX, point.x),
      minimumZ: Math.min(bounds.minimumZ, point.z),
    }),
    {
      maximumX: Number.NEGATIVE_INFINITY,
      maximumZ: Number.NEGATIVE_INFINITY,
      minimumX: Number.POSITIVE_INFINITY,
      minimumZ: Number.POSITIVE_INFINITY,
    },
  )
}

function polygonArea(points: readonly LandrushPoint2[]) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    area += current.x * next.z - next.x * current.z
  }
  return Math.abs(area) * 0.5
}

function pointInPolygon(point: LandrushPoint2, polygon: readonly LandrushPoint2[]) {
  let inside = false
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; index += 1) {
    const current = polygon[index]
    const previous = polygon[previousIndex]
    if (!(current && previous)) continue
    const crosses = current.z > point.z !== previous.z > point.z
    const boundaryX =
      ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z || 0.000_001) +
      current.x
    if (crosses && point.x < boundaryX) inside = !inside
    previousIndex = index
  }
  return inside
}

function distanceToClosedPolyline(point: LandrushPoint2, points: readonly LandrushPoint2[]) {
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < points.length; index += 1) {
    best = Math.min(
      best,
      distanceToSegment(point, points[index]!, points[(index + 1) % points.length]!),
    )
  }
  return best
}

function distanceToOpenPolyline(point: LandrushPoint2, points: readonly LandrushPoint2[]) {
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < points.length - 1; index += 1) {
    best = Math.min(best, distanceToSegment(point, points[index]!, points[index + 1]!))
  }
  return best
}

function distanceToSegment(point: LandrushPoint2, start: LandrushPoint2, end: LandrushPoint2) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const denominator = dx * dx + dz * dz
  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / (denominator || 1)),
  )
  return Math.hypot(point.x - (start.x + dx * ratio), point.z - (start.z + dz * ratio))
}

function pointDistanceSquared(left: LandrushPoint2, right: LandrushPoint2) {
  return (left.x - right.x) ** 2 + (left.z - right.z) ** 2
}

function hashString(value: string) {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function mixHash(seed: number, value: number) {
  let hash = (seed ^ value) >>> 0
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb_352d)
  hash = Math.imul(hash ^ (hash >>> 15), 0x846c_a68b)
  return (hash ^ (hash >>> 16)) >>> 0
}

function hashUnit(seed: number, salt: number) {
  return mixHash(seed, salt) / 0x1_0000_0000
}

function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Math.round(value)))
}
