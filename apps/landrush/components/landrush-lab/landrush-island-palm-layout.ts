import {
  LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
  LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
  LANDRUSH_ISLAND_AMBIENT_PALMS,
} from '@landrush/zombie-gameplay/landrush-island-ambient-catalog'
import type { ZombieEscapeCollisionCircleSource } from '@landrush/zombie-gameplay/zombie-escape-collision-world'
import type { LandrushPoint2 } from '@/components/landrush/types'
import type { NaturalRoadPlan } from './natural-road-network-layer'

const PALM_PLACEMENT_EPSILON_METERS = 0.000_000_1
const PALM_RELOCATION_INSET_STEP = 0.035
const PALM_RELOCATION_MAX_CANDIDATES = 8192
const PALM_RELOCATION_MAX_INSET = 0.94
const PALM_RELOCATION_MIN_INSET = 0.2

export type LandrushIslandPalmRoadClearance = NaturalRoadPlan['footprints']['clearance']

export type LandrushIslandPalmPlacement = Readonly<{
  catalogIndex: number
  heightMeters: number
  id: string
  instanceIndex: number
  position: LandrushPoint2
  trunkRadiusMeters: number
}>

export type LandrushIslandAmbientPalmSlot = Readonly<{
  instanceIndex: number
  visible: boolean
}>

type LandrushIslandPalmBounds = Readonly<{
  maximumX: number
  maximumZ: number
  minimumX: number
  minimumZ: number
}>

type LandrushIslandPalmBoundarySegment = LandrushIslandPalmBounds &
  Readonly<{
    endX: number
    endZ: number
    startX: number
    startZ: number
  }>

type LandrushIslandPalmRingQuery = Readonly<{
  bounds: LandrushIslandPalmBounds
  points: readonly LandrushPoint2[]
}>

type LandrushIslandPalmRoadPolygonQuery = Readonly<{
  bounds: LandrushIslandPalmBounds
  holes: readonly LandrushIslandPalmRingQuery[]
  outer: LandrushIslandPalmRingQuery
}>

export type LandrushIslandPalmPlacementQuery = Readonly<{
  roadBoundarySegments: readonly LandrushIslandPalmBoundarySegment[]
  roadPolygons: readonly LandrushIslandPalmRoadPolygonQuery[]
  shoreline: LandrushIslandPalmRingQuery
  shorelineBoundarySegments: readonly LandrushIslandPalmBoundarySegment[]
}>

export function createLandrushIslandPalmLayout({
  center,
  instanceCount = LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
  roadClearance,
  shoreline,
}: {
  center: LandrushPoint2
  instanceCount?: number
  roadClearance: LandrushIslandPalmRoadClearance
  shoreline: readonly LandrushPoint2[]
}): readonly LandrushIslandPalmPlacement[] {
  const placementQuery = createLandrushIslandPalmPlacementQuery({ roadClearance, shoreline })
  const placements: LandrushIslandPalmPlacement[] = []
  for (let instanceIndex = 0; instanceIndex < instanceCount; instanceIndex += 1) {
    const catalogIndex = instanceIndex % LANDRUSH_ISLAND_AMBIENT_PALMS.length
    const palm = LANDRUSH_ISLAND_AMBIENT_PALMS[catalogIndex]!
    const sizeFactor = 0.9 + (instanceIndex % 5) * 0.035
    const heightMeters = palm.heightMeters * sizeFactor
    const trunkRadiusMeters = palm.trunkRadiusMeters * sizeFactor
    const preferredPosition = resolveLandrushIslandAmbientPalmPosition({
      center,
      dayInstanceCount: LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
      instanceCount,
      instanceIndex,
      shoreline,
    })
    const position = resolveLandrushIslandLegalPalmPosition({
      acceptedPlacements: placements,
      center,
      instanceCount,
      instanceIndex,
      placementQuery,
      preferredPosition,
      trunkRadiusMeters,
    })
    placements.push({
      catalogIndex,
      heightMeters,
      id: `palm:${String(instanceIndex)}`,
      instanceIndex,
      position,
      trunkRadiusMeters,
    })
  }
  return placements
}

export function createLandrushIslandPalmPlacementQuery({
  roadClearance,
  shoreline,
}: {
  roadClearance: LandrushIslandPalmRoadClearance
  shoreline: readonly LandrushPoint2[]
}): LandrushIslandPalmPlacementQuery {
  const shorelineRing = createLandrushIslandPalmRingQuery(shoreline)
  if (!shorelineRing) throw new Error('Palm placement requires a valid shoreline polygon.')

  const roadBoundarySegments: LandrushIslandPalmBoundarySegment[] = []
  const roadPolygons: LandrushIslandPalmRoadPolygonQuery[] = []
  for (const polygon of roadClearance) {
    const outer = createLandrushIslandPalmRingQuery(polygon[0] ?? [])
    if (!outer) continue
    const holes = polygon
      .slice(1)
      .map(createLandrushIslandPalmRingQuery)
      .filter((ring): ring is LandrushIslandPalmRingQuery => ring !== null)
    roadPolygons.push({ bounds: outer.bounds, holes, outer })
    appendLandrushIslandPalmRingSegments(outer.points, roadBoundarySegments)
    for (const hole of holes) {
      appendLandrushIslandPalmRingSegments(hole.points, roadBoundarySegments)
    }
  }

  const shorelineBoundarySegments: LandrushIslandPalmBoundarySegment[] = []
  appendLandrushIslandPalmRingSegments(shorelineRing.points, shorelineBoundarySegments)
  return {
    roadBoundarySegments,
    roadPolygons,
    shoreline: shorelineRing,
    shorelineBoundarySegments,
  }
}

export function isLandrushIslandPalmDiskPlacementLegal({
  acceptedPlacements,
  placementQuery,
  position,
  trunkRadiusMeters,
}: {
  acceptedPlacements: readonly Pick<LandrushIslandPalmPlacement, 'position' | 'trunkRadiusMeters'>[]
  placementQuery: LandrushIslandPalmPlacementQuery
  position: LandrushPoint2
  trunkRadiusMeters: number
}) {
  if (
    !(Number.isFinite(position.x) && Number.isFinite(position.z)) ||
    !(Number.isFinite(trunkRadiusMeters) && trunkRadiusMeters >= 0)
  ) {
    return false
  }

  const shorelineBoundaryDistance = minimumLandrushIslandPalmBoundaryDistance(
    position,
    placementQuery.shorelineBoundarySegments,
  )
  if (
    !pointIsInsideLandrushIslandPalmRing(position, placementQuery.shoreline) &&
    shorelineBoundaryDistance > PALM_PLACEMENT_EPSILON_METERS
  ) {
    return false
  }
  if (shorelineBoundaryDistance + PALM_PLACEMENT_EPSILON_METERS < trunkRadiusMeters) {
    return false
  }

  if (pointIsInsideLandrushIslandPalmRoadClearance(position, placementQuery.roadPolygons)) {
    return false
  }
  const roadBoundaryDistance = minimumLandrushIslandPalmBoundaryDistance(
    position,
    placementQuery.roadBoundarySegments,
  )
  if (roadBoundaryDistance + PALM_PLACEMENT_EPSILON_METERS < trunkRadiusMeters) {
    return false
  }

  for (const accepted of acceptedPlacements) {
    const minimumDistance = trunkRadiusMeters + accepted.trunkRadiusMeters
    if (
      Math.hypot(position.x - accepted.position.x, position.z - accepted.position.z) +
        PALM_PLACEMENT_EPSILON_METERS <
      minimumDistance
    ) {
      return false
    }
  }
  return true
}

export function resolveLandrushIslandPalmLayoutCenter(points: readonly LandrushPoint2[]) {
  if (points.length === 0) return { x: 0, z: 0 }
  let x = 0
  let z = 0
  for (const point of points) {
    x += point.x
    z += point.z
  }
  return { x: x / points.length, z: z / points.length }
}

export function createLandrushIslandPalmCollisionCircles({
  layout,
  origin,
}: {
  layout: readonly LandrushIslandPalmPlacement[]
  origin: Readonly<{ x: number; z: number }>
}): readonly ZombieEscapeCollisionCircleSource[] {
  return layout.map((placement) => ({
    breakable: false,
    id: `${placement.id}:trunk`,
    maximumY: placement.heightMeters,
    minimumY: 0,
    navigationLayerY: 0,
    objectId: placement.id,
    radius: placement.trunkRadiusMeters,
    x: placement.position.x - origin.x,
    z: placement.position.z - origin.z,
  }))
}

export function resolveLandrushIslandAmbientPalmSlots({
  catalogIndex,
  catalogSize,
  dayInstanceCount,
  instanceCount,
  zombieIslandActive,
}: {
  catalogIndex: number
  catalogSize: number
  dayInstanceCount: number
  instanceCount: number
  zombieIslandActive: boolean
}): readonly LandrushIslandAmbientPalmSlot[] {
  const slots: LandrushIslandAmbientPalmSlot[] = []
  for (
    let instanceIndex = catalogIndex;
    instanceIndex < instanceCount;
    instanceIndex += catalogSize
  ) {
    slots.push({
      instanceIndex,
      visible: zombieIslandActive || instanceIndex < dayInstanceCount,
    })
  }
  return slots
}

export function resolveLandrushIslandAmbientPalmPosition({
  center,
  dayInstanceCount,
  instanceCount,
  instanceIndex,
  shoreline,
}: {
  center: LandrushPoint2
  dayInstanceCount: number
  instanceCount: number
  instanceIndex: number
  shoreline: readonly LandrushPoint2[]
}): LandrushPoint2 {
  const daySlot = instanceIndex < dayInstanceCount
  const placementCount = daySlot ? dayInstanceCount : instanceCount
  const inset = daySlot ? 0.82 : 0.77 + (instanceIndex % 3) * 0.035
  const point =
    shoreline[
      Math.floor(((instanceIndex + 0.55) * shoreline.length) / Math.max(1, placementCount)) %
        shoreline.length
    ]
  if (!point) return center
  return {
    x: center.x + (point.x - center.x) * inset,
    z: center.z + (point.z - center.z) * inset,
  }
}

function resolveLandrushIslandLegalPalmPosition({
  acceptedPlacements,
  center,
  instanceCount,
  instanceIndex,
  placementQuery,
  preferredPosition,
  trunkRadiusMeters,
}: {
  acceptedPlacements: readonly LandrushIslandPalmPlacement[]
  center: LandrushPoint2
  instanceCount: number
  instanceIndex: number
  placementQuery: LandrushIslandPalmPlacementQuery
  preferredPosition: LandrushPoint2
  trunkRadiusMeters: number
}) {
  const legal = (position: LandrushPoint2) =>
    isLandrushIslandPalmDiskPlacementLegal({
      acceptedPlacements,
      placementQuery,
      position,
      trunkRadiusMeters,
    })
  if (legal(preferredPosition)) return preferredPosition

  const shoreline = placementQuery.shoreline.points
  const daySlot = instanceIndex < LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT
  const placementCount = daySlot ? LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT : instanceCount
  const inset = daySlot ? 0.82 : 0.77 + (instanceIndex % 3) * 0.035
  const sourceIndex =
    Math.floor(((instanceIndex + 0.55) * shoreline.length) / Math.max(1, placementCount)) %
    shoreline.length
  const maximumAngularOffset = Math.ceil(shoreline.length / 2)
  const maximumRadialOffset = Math.max(
    Math.floor((inset - PALM_RELOCATION_MIN_INSET) / PALM_RELOCATION_INSET_STEP),
    Math.floor((PALM_RELOCATION_MAX_INSET - inset) / PALM_RELOCATION_INSET_STEP),
  )
  const testedPositions = new Set([landrushIslandPalmPositionKey(preferredPosition)])
  let candidateCount = 0

  for (let shell = 1; shell <= maximumAngularOffset + maximumRadialOffset; shell += 1) {
    const maximumShellAngularOffset = Math.min(shell, maximumAngularOffset)
    for (
      let angularOffsetMagnitude = 0;
      angularOffsetMagnitude <= maximumShellAngularOffset;
      angularOffsetMagnitude += 1
    ) {
      const radialOffsetMagnitude = shell - angularOffsetMagnitude
      if (radialOffsetMagnitude > maximumRadialOffset) continue
      const angularOffsets = alternatingLandrushIslandPalmOffsets(angularOffsetMagnitude, false)
      const radialOffsets = alternatingLandrushIslandPalmOffsets(radialOffsetMagnitude, true)
      for (const angularOffset of angularOffsets) {
        const shorelinePoint =
          shoreline[positiveLandrushIslandPalmModulo(sourceIndex + angularOffset, shoreline.length)]
        if (!shorelinePoint) continue
        for (const radialOffset of radialOffsets) {
          const candidateInset = inset + radialOffset * PALM_RELOCATION_INSET_STEP
          if (
            candidateInset < PALM_RELOCATION_MIN_INSET ||
            candidateInset > PALM_RELOCATION_MAX_INSET
          ) {
            continue
          }
          const candidate = {
            x: center.x + (shorelinePoint.x - center.x) * candidateInset,
            z: center.z + (shorelinePoint.z - center.z) * candidateInset,
          }
          const candidateKey = landrushIslandPalmPositionKey(candidate)
          if (testedPositions.has(candidateKey)) continue
          testedPositions.add(candidateKey)
          candidateCount += 1
          if (legal(candidate)) return candidate
          if (candidateCount >= PALM_RELOCATION_MAX_CANDIDATES) {
            throw new Error(
              `Unable to place palm:${String(instanceIndex)} after ${String(candidateCount)} deterministic candidates.`,
            )
          }
        }
      }
    }
  }

  throw new Error(
    `Unable to place palm:${String(instanceIndex)} after ${String(candidateCount)} deterministic candidates.`,
  )
}

function alternatingLandrushIslandPalmOffsets(magnitude: number, negativeFirst: boolean) {
  if (magnitude === 0) return [0]
  return negativeFirst ? [-magnitude, magnitude] : [magnitude, -magnitude]
}

function positiveLandrushIslandPalmModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor
}

function landrushIslandPalmPositionKey(position: LandrushPoint2) {
  return `${position.x.toFixed(8)}:${position.z.toFixed(8)}`
}

function createLandrushIslandPalmRingQuery(
  points: readonly (LandrushPoint2 | readonly number[])[],
): LandrushIslandPalmRingQuery | null {
  const cleaned: LandrushPoint2[] = []
  for (const point of points) {
    const x = 'x' in point ? point.x : point[0]
    const z = 'z' in point ? point.z : point[1]
    if (!(Number.isFinite(x) && Number.isFinite(z))) continue
    const previous = cleaned.at(-1)
    if (previous && previous.x === x && previous.z === z) continue
    cleaned.push({ x: x!, z: z! })
  }
  const first = cleaned[0]
  const last = cleaned.at(-1)
  if (first && last && first.x === last.x && first.z === last.z) cleaned.pop()
  if (cleaned.length < 3) return null

  let maximumX = Number.NEGATIVE_INFINITY
  let maximumZ = Number.NEGATIVE_INFINITY
  let minimumX = Number.POSITIVE_INFINITY
  let minimumZ = Number.POSITIVE_INFINITY
  for (const point of cleaned) {
    maximumX = Math.max(maximumX, point.x)
    maximumZ = Math.max(maximumZ, point.z)
    minimumX = Math.min(minimumX, point.x)
    minimumZ = Math.min(minimumZ, point.z)
  }
  return {
    bounds: { maximumX, maximumZ, minimumX, minimumZ },
    points: cleaned,
  }
}

function appendLandrushIslandPalmRingSegments(
  points: readonly LandrushPoint2[],
  output: LandrushIslandPalmBoundarySegment[],
) {
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]!
    const end = points[(index + 1) % points.length]!
    output.push({
      endX: end.x,
      endZ: end.z,
      maximumX: Math.max(start.x, end.x),
      maximumZ: Math.max(start.z, end.z),
      minimumX: Math.min(start.x, end.x),
      minimumZ: Math.min(start.z, end.z),
      startX: start.x,
      startZ: start.z,
    })
  }
}

function pointIsInsideLandrushIslandPalmRoadClearance(
  point: LandrushPoint2,
  polygons: readonly LandrushIslandPalmRoadPolygonQuery[],
) {
  for (const polygon of polygons) {
    if (!landrushIslandPalmBoundsContainPoint(polygon.bounds, point)) continue
    if (!pointIsInsideLandrushIslandPalmRing(point, polygon.outer)) continue
    if (polygon.holes.some((hole) => pointIsInsideLandrushIslandPalmRing(point, hole))) continue
    return true
  }
  return false
}

function pointIsInsideLandrushIslandPalmRing(
  point: LandrushPoint2,
  ring: LandrushIslandPalmRingQuery,
) {
  if (!landrushIslandPalmBoundsContainPoint(ring.bounds, point)) return false
  let inside = false
  for (let index = 0, previousIndex = ring.points.length - 1; index < ring.points.length; ) {
    const current = ring.points[index]!
    const previous = ring.points[previousIndex]!
    if (
      current.z > point.z !== previous.z > point.z &&
      point.x <
        ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z) + current.x
    ) {
      inside = !inside
    }
    previousIndex = index
    index += 1
  }
  return inside
}

function landrushIslandPalmBoundsContainPoint(
  bounds: LandrushIslandPalmBounds,
  point: LandrushPoint2,
) {
  return (
    point.x >= bounds.minimumX - PALM_PLACEMENT_EPSILON_METERS &&
    point.x <= bounds.maximumX + PALM_PLACEMENT_EPSILON_METERS &&
    point.z >= bounds.minimumZ - PALM_PLACEMENT_EPSILON_METERS &&
    point.z <= bounds.maximumZ + PALM_PLACEMENT_EPSILON_METERS
  )
}

function minimumLandrushIslandPalmBoundaryDistance(
  point: LandrushPoint2,
  segments: readonly LandrushIslandPalmBoundarySegment[],
) {
  let minimumDistanceSquared = Number.POSITIVE_INFINITY
  for (const segment of segments) {
    const boundsDistanceX =
      point.x < segment.minimumX
        ? segment.minimumX - point.x
        : point.x > segment.maximumX
          ? point.x - segment.maximumX
          : 0
    const boundsDistanceZ =
      point.z < segment.minimumZ
        ? segment.minimumZ - point.z
        : point.z > segment.maximumZ
          ? point.z - segment.maximumZ
          : 0
    if (
      boundsDistanceX * boundsDistanceX + boundsDistanceZ * boundsDistanceZ >=
      minimumDistanceSquared
    ) {
      continue
    }
    minimumDistanceSquared = Math.min(
      minimumDistanceSquared,
      distanceToLandrushIslandPalmSegmentSquared(point, segment),
    )
  }
  return Math.sqrt(minimumDistanceSquared)
}

function distanceToLandrushIslandPalmSegmentSquared(
  point: LandrushPoint2,
  segment: LandrushIslandPalmBoundarySegment,
) {
  const segmentX = segment.endX - segment.startX
  const segmentZ = segment.endZ - segment.startZ
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ
  const amount =
    lengthSquared <= Number.EPSILON
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - segment.startX) * segmentX + (point.z - segment.startZ) * segmentZ) /
              lengthSquared,
          ),
        )
  const offsetX = point.x - (segment.startX + segmentX * amount)
  const offsetZ = point.z - (segment.startZ + segmentZ * amount)
  return offsetX * offsetX + offsetZ * offsetZ
}
