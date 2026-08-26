import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping'
import {
  ZOMBIE_ESCAPE_COLLISION_EPSILON_METERS as COLLISION_EPSILON_METERS,
  ZOMBIE_ESCAPE_GEOMETRY_EPSILON as GEOMETRY_EPSILON,
  ZOMBIE_ESCAPE_NAVIGATION_AGENT_HEIGHT_METERS as NAVIGATION_AGENT_HEIGHT_METERS,
} from './zombie-escape-collision-tolerances'

const FULL_TURN_RADIANS = Math.PI * 2
const POLYGON_BOOLEAN_COORDINATE_QUANTUM_METERS = 2 ** -40

export type ZombieEscapeSparseObstacleFootprintPoint = Readonly<{
  x: number
  z: number
}>

type ZombieEscapeSparseObstacleFootprintVerticalRange = Readonly<{
  breakable: boolean
  maximumY: number
  minimumY: number
}>

export type ZombieEscapeSparseObstacleFootprintBox =
  ZombieEscapeSparseObstacleFootprintVerticalRange &
    Readonly<{
      centerX: number
      centerZ: number
      halfDepth: number
      halfWidth: number
      worldAxisX: number
      worldAxisZ: number
    }>

export type ZombieEscapeSparseObstacleFootprintCircle =
  ZombieEscapeSparseObstacleFootprintVerticalRange &
    Readonly<{
      radius: number
      x: number
      z: number
    }>

export type ZombieEscapeSparseObstacleFootprintSegment =
  ZombieEscapeSparseObstacleFootprintVerticalRange &
    Readonly<{
      endCap: 'flat' | 'round'
      endX: number
      endZ: number
      halfThickness: number
      startCap: 'flat' | 'round'
      startX: number
      startZ: number
    }>

export type ZombieEscapeSparseObstacleFootprintComponent = Readonly<{
  holes: readonly (readonly ZombieEscapeSparseObstacleFootprintPoint[])[]
  outer: readonly ZombieEscapeSparseObstacleFootprintPoint[]
}>

export type ZombieEscapeSparseObstacleFootprintLayerUnion = Readonly<{
  components: readonly ZombieEscapeSparseObstacleFootprintComponent[]
  layerIndex: number
  maximumArcOverageMeters: number
}>

type SparseObstacleFootprint = Readonly<{
  maximumX: number
  maximumArcOverageMeters: number
  maximumY: number
  maximumZ: number
  minimumX: number
  minimumY: number
  minimumZ: number
  polygon: Polygon
}>

type SupportFunction = (normalX: number, normalZ: number) => number

export function createZombieEscapeSparseObstacleFootprintUnions({
  agentRadius,
  arcToleranceMeters,
  boxes,
  circles,
  layerElevations,
  segments,
}: {
  agentRadius: number
  arcToleranceMeters: number
  boxes: readonly ZombieEscapeSparseObstacleFootprintBox[]
  circles: readonly ZombieEscapeSparseObstacleFootprintCircle[]
  layerElevations: readonly number[]
  segments: readonly ZombieEscapeSparseObstacleFootprintSegment[]
}): readonly ZombieEscapeSparseObstacleFootprintLayerUnion[] {
  if (!Number.isFinite(agentRadius) || agentRadius < 0) {
    throw new RangeError('agentRadius must be a finite non-negative number')
  }
  if (!Number.isFinite(arcToleranceMeters) || arcToleranceMeters <= 0) {
    throw new RangeError('arcToleranceMeters must be a finite positive number')
  }
  if (!layerElevations.every(Number.isFinite)) {
    throw new RangeError('layerElevations must contain only finite numbers')
  }

  const footprints = [
    ...boxes.flatMap((box) =>
      box.breakable ? [] : createBoxFootprint(box, agentRadius, arcToleranceMeters),
    ),
    ...circles.flatMap((circle) =>
      circle.breakable ? [] : createCircleFootprint(circle, agentRadius, arcToleranceMeters),
    ),
    ...segments.flatMap((segment) =>
      segment.breakable ? [] : createSegmentFootprint(segment, agentRadius, arcToleranceMeters),
    ),
  ]

  return layerElevations.map((elevation, layerIndex) => {
    const layerFootprints = footprints
      .filter((footprint) => verticalRangeBlocksLayer(footprint, elevation))
      .sort((first, second) => comparePolygons(first.polygon, second.polygon))
    const maximumArcOverageMeters = layerFootprints.reduce(
      (maximum, footprint) => Math.max(maximum, footprint.maximumArcOverageMeters),
      0,
    )
    if (layerFootprints.length === 0) {
      return { components: [], layerIndex, maximumArcOverageMeters }
    }
    const union = unionSparseObstacleFootprints(layerFootprints)
    return {
      components: canonicalizeMultiPolygon(union),
      layerIndex,
      maximumArcOverageMeters,
    }
  })
}

function unionSparseObstacleFootprints(
  footprints: readonly SparseObstacleFootprint[],
): MultiPolygon {
  const parents = new Int32Array(footprints.length)
  const ranks = new Uint8Array(footprints.length)
  const orderedIndices = footprints
    .map((_, index) => index)
    .sort(
      (first, second) =>
        footprints[first]!.minimumX - footprints[second]!.minimumX || first - second,
    )
  for (let index = 0; index < footprints.length; index += 1) parents[index] = index

  const active: number[] = []
  for (const footprintIndex of orderedIndices) {
    const footprint = footprints[footprintIndex]!
    let activeWrite = 0
    for (const activeIndex of active) {
      const activeFootprint = footprints[activeIndex]!
      if (activeFootprint.maximumX + GEOMETRY_EPSILON < footprint.minimumX) continue
      active[activeWrite] = activeIndex
      activeWrite += 1
      if (
        activeFootprint.maximumZ + GEOMETRY_EPSILON < footprint.minimumZ ||
        footprint.maximumZ + GEOMETRY_EPSILON < activeFootprint.minimumZ
      ) {
        continue
      }
      unionSparseObstacleFootprintGroups(parents, ranks, activeIndex, footprintIndex)
    }
    active.length = activeWrite
    active.push(footprintIndex)
  }

  const groupIndices = new Map<number, number[]>()
  for (let index = 0; index < footprints.length; index += 1) {
    const root = findSparseObstacleFootprintGroup(parents, index)
    const group = groupIndices.get(root)
    if (group) group.push(index)
    else groupIndices.set(root, [index])
  }

  const union: MultiPolygon = []
  for (const group of [...groupIndices.values()].sort((first, second) => first[0]! - second[0]!)) {
    union.push(
      ...polygonClipping.union(
        footprints[group[0]!]!.polygon,
        ...group.slice(1).map((index) => footprints[index]!.polygon),
      ),
    )
  }
  return union
}

function findSparseObstacleFootprintGroup(parents: Int32Array, index: number) {
  let root = index
  while (parents[root] !== root) root = parents[root]!
  while (parents[index] !== index) {
    const next = parents[index]!
    parents[index] = root
    index = next
  }
  return root
}

function unionSparseObstacleFootprintGroups(
  parents: Int32Array,
  ranks: Uint8Array,
  first: number,
  second: number,
) {
  let firstRoot = findSparseObstacleFootprintGroup(parents, first)
  let secondRoot = findSparseObstacleFootprintGroup(parents, second)
  if (firstRoot === secondRoot) return
  if (ranks[firstRoot]! < ranks[secondRoot]!) {
    const swap = firstRoot
    firstRoot = secondRoot
    secondRoot = swap
  }
  parents[secondRoot] = firstRoot
  if (ranks[firstRoot] === ranks[secondRoot]) ranks[firstRoot]! += 1
}

function createBoxFootprint(
  box: ZombieEscapeSparseObstacleFootprintBox,
  agentRadius: number,
  arcToleranceMeters: number,
): readonly SparseObstacleFootprint[] {
  if (
    ![box.centerX, box.centerZ, box.halfDepth, box.halfWidth, box.worldAxisX, box.worldAxisZ].every(
      Number.isFinite,
    )
  ) {
    return []
  }
  const halfWidth = Math.max(0, box.halfWidth)
  const halfDepth = Math.max(0, box.halfDepth)
  const axisLength = Math.hypot(box.worldAxisX, box.worldAxisZ)
  if (axisLength <= GEOMETRY_EPSILON) return []
  const axisX = box.worldAxisX / axisLength
  const axisZ = box.worldAxisZ / axisLength
  const normalX = -axisZ
  const normalZ = axisX
  if (agentRadius <= GEOMETRY_EPSILON) {
    const ring = createOrientedRectangleRing(
      box.centerX,
      box.centerZ,
      axisX,
      axisZ,
      normalX,
      normalZ,
      halfWidth,
      halfDepth,
    )
    return createFootprintResult(ring, 0, box)
  }
  const support: SupportFunction = (queryX, queryZ) =>
    queryX * box.centerX +
    queryZ * box.centerZ +
    halfWidth * Math.abs(queryX * axisX + queryZ * axisZ) +
    halfDepth * Math.abs(queryX * normalX + queryZ * normalZ) +
    agentRadius
  const axisAngle = Math.atan2(axisZ, axisX)
  return createFootprintResult(
    createCircumscribedSupportRing(support, agentRadius, arcToleranceMeters, [
      axisAngle,
      axisAngle + Math.PI / 2,
      axisAngle + Math.PI,
      axisAngle + (Math.PI * 3) / 2,
    ]),
    resolveMaximumArcOverage(agentRadius, arcToleranceMeters),
    box,
  )
}

function createCircleFootprint(
  circle: ZombieEscapeSparseObstacleFootprintCircle,
  agentRadius: number,
  arcToleranceMeters: number,
): readonly SparseObstacleFootprint[] {
  if (![circle.radius, circle.x, circle.z].every(Number.isFinite)) return []
  const radius = Math.max(0, circle.radius) + agentRadius
  if (radius <= GEOMETRY_EPSILON) return []
  const support: SupportFunction = (normalX, normalZ) =>
    normalX * circle.x + normalZ * circle.z + radius
  return createFootprintResult(
    createCircumscribedSupportRing(support, radius, arcToleranceMeters, []),
    resolveMaximumArcOverage(radius, arcToleranceMeters),
    circle,
  )
}

function createSegmentFootprint(
  segment: ZombieEscapeSparseObstacleFootprintSegment,
  agentRadius: number,
  arcToleranceMeters: number,
): readonly SparseObstacleFootprint[] {
  if (
    ![segment.endX, segment.endZ, segment.halfThickness, segment.startX, segment.startZ].every(
      Number.isFinite,
    )
  ) {
    return []
  }
  const directionX = segment.endX - segment.startX
  const directionZ = segment.endZ - segment.startZ
  const length = Math.hypot(directionX, directionZ)
  const radius = Math.max(0, segment.halfThickness) + agentRadius
  const hasRoundCap = segment.startCap === 'round' || segment.endCap === 'round'
  if (length <= GEOMETRY_EPSILON) {
    if (!hasRoundCap || radius <= GEOMETRY_EPSILON) return []
    const support: SupportFunction = (normalX, normalZ) =>
      normalX * segment.startX + normalZ * segment.startZ + radius
    return createFootprintResult(
      createCircumscribedSupportRing(support, radius, arcToleranceMeters, []),
      resolveMaximumArcOverage(radius, arcToleranceMeters),
      segment,
    )
  }
  if (radius <= GEOMETRY_EPSILON) return []
  const axisX = directionX / length
  const axisZ = directionZ / length
  const normalX = -axisZ
  const normalZ = axisX
  if (segment.startCap === 'flat' && segment.endCap === 'flat') {
    return createFootprintResult(
      [
        { x: segment.startX - normalX * radius, z: segment.startZ - normalZ * radius },
        { x: segment.endX - normalX * radius, z: segment.endZ - normalZ * radius },
        { x: segment.endX + normalX * radius, z: segment.endZ + normalZ * radius },
        { x: segment.startX + normalX * radius, z: segment.startZ + normalZ * radius },
      ],
      0,
      segment,
    )
  }

  const axisAngle = Math.atan2(axisZ, axisX)
  if (segment.startCap === 'round' && segment.endCap === 'round') {
    const support: SupportFunction = (queryX, queryZ) =>
      Math.max(
        queryX * segment.startX + queryZ * segment.startZ,
        queryX * segment.endX + queryZ * segment.endZ,
      ) + radius
    return createFootprintResult(
      createCircumscribedSupportRing(support, radius, arcToleranceMeters, [
        axisAngle + Math.PI / 2,
        axisAngle - Math.PI / 2,
      ]),
      resolveMaximumArcOverage(radius, arcToleranceMeters),
      segment,
    )
  }

  const rectangle = createFootprintResult(
    [
      { x: segment.startX - normalX * radius, z: segment.startZ - normalZ * radius },
      { x: segment.endX - normalX * radius, z: segment.endZ - normalZ * radius },
      { x: segment.endX + normalX * radius, z: segment.endZ + normalZ * radius },
      { x: segment.startX + normalX * radius, z: segment.startZ + normalZ * radius },
    ],
    0,
    segment,
  )
  const roundCenterX = segment.startCap === 'round' ? segment.startX : segment.endX
  const roundCenterZ = segment.startCap === 'round' ? segment.startZ : segment.endZ
  const roundSupport: SupportFunction = (queryX, queryZ) =>
    queryX * roundCenterX + queryZ * roundCenterZ + radius
  const roundEnd = createFootprintResult(
    createCircumscribedSupportRing(roundSupport, radius, arcToleranceMeters, []),
    resolveMaximumArcOverage(radius, arcToleranceMeters),
    segment,
  )
  return [...rectangle, ...roundEnd]
}

function createOrientedRectangleRing(
  centerX: number,
  centerZ: number,
  axisX: number,
  axisZ: number,
  normalX: number,
  normalZ: number,
  halfWidth: number,
  halfDepth: number,
) {
  if (halfWidth <= GEOMETRY_EPSILON || halfDepth <= GEOMETRY_EPSILON) return []
  return [
    {
      x: centerX - axisX * halfWidth - normalX * halfDepth,
      z: centerZ - axisZ * halfWidth - normalZ * halfDepth,
    },
    {
      x: centerX + axisX * halfWidth - normalX * halfDepth,
      z: centerZ + axisZ * halfWidth - normalZ * halfDepth,
    },
    {
      x: centerX + axisX * halfWidth + normalX * halfDepth,
      z: centerZ + axisZ * halfWidth + normalZ * halfDepth,
    },
    {
      x: centerX - axisX * halfWidth + normalX * halfDepth,
      z: centerZ - axisZ * halfWidth + normalZ * halfDepth,
    },
  ]
}

function createCircumscribedSupportRing(
  support: SupportFunction,
  curvatureRadius: number,
  arcToleranceMeters: number,
  requiredNormalAngles: readonly number[],
) {
  const normalCount = resolveCircumscribedNormalCount(curvatureRadius, arcToleranceMeters)
  const angles = canonicalizeAngles([
    ...Array.from({ length: normalCount }, (_, index) => (index / normalCount) * FULL_TURN_RADIANS),
    ...requiredNormalAngles,
  ])
  const ring: ZombieEscapeSparseObstacleFootprintPoint[] = []
  for (let index = 0; index < angles.length; index += 1) {
    const firstAngle = angles[index]!
    const secondAngle = angles[(index + 1) % angles.length]!
    const firstNormalX = Math.cos(firstAngle)
    const firstNormalZ = Math.sin(firstAngle)
    const secondNormalX = Math.cos(secondAngle)
    const secondNormalZ = Math.sin(secondAngle)
    const determinant = firstNormalX * secondNormalZ - firstNormalZ * secondNormalX
    if (Math.abs(determinant) <= GEOMETRY_EPSILON) continue
    const firstSupport = support(firstNormalX, firstNormalZ)
    const secondSupport = support(secondNormalX, secondNormalZ)
    ring.push({
      x: normalizeZero((firstSupport * secondNormalZ - firstNormalZ * secondSupport) / determinant),
      z: normalizeZero((firstNormalX * secondSupport - firstSupport * secondNormalX) / determinant),
    })
  }
  return ring
}

function resolveCircumscribedNormalCount(radius: number, tolerance: number) {
  const maximumHalfAngle = Math.acos(Math.min(1, radius / (radius + tolerance)))
  if (!(maximumHalfAngle > 0)) {
    throw new RangeError('arcToleranceMeters is too small for the supplied obstacle radius')
  }
  return Math.max(4, Math.ceil(Math.PI / maximumHalfAngle))
}

function resolveMaximumArcOverage(radius: number, tolerance: number) {
  const normalCount = resolveCircumscribedNormalCount(radius, tolerance)
  return radius * (1 / Math.cos(Math.PI / normalCount) - 1)
}

function canonicalizeAngles(angles: readonly number[]) {
  const sorted = angles
    .map((angle) => ((angle % FULL_TURN_RADIANS) + FULL_TURN_RADIANS) % FULL_TURN_RADIANS)
    .sort((first, second) => first - second)
  const canonical: number[] = []
  for (const angle of sorted) {
    const previous = canonical[canonical.length - 1]
    if (previous !== undefined && Math.abs(angle - previous) <= GEOMETRY_EPSILON) continue
    canonical.push(angle)
  }
  if (
    canonical.length > 1 &&
    FULL_TURN_RADIANS - canonical[canonical.length - 1]! + canonical[0]! <= GEOMETRY_EPSILON
  ) {
    canonical.pop()
  }
  return canonical
}

function createFootprintResult(
  rawRing: readonly ZombieEscapeSparseObstacleFootprintPoint[],
  maximumArcOverageMeters: number,
  verticalRange: Readonly<{ maximumY: number; minimumY: number }>,
): readonly SparseObstacleFootprint[] {
  const ring = canonicalizeRing(rawRing, true)
  if (ring.length < 3 || Math.abs(signedArea(ring)) <= GEOMETRY_EPSILON) return []
  let maximumX = Number.NEGATIVE_INFINITY
  let maximumZ = Number.NEGATIVE_INFINITY
  let minimumX = Number.POSITIVE_INFINITY
  let minimumZ = Number.POSITIVE_INFINITY
  for (const point of ring) {
    maximumX = Math.max(maximumX, point.x)
    maximumZ = Math.max(maximumZ, point.z)
    minimumX = Math.min(minimumX, point.x)
    minimumZ = Math.min(minimumZ, point.z)
  }
  return [
    {
      maximumX,
      maximumArcOverageMeters,
      maximumY: verticalRange.maximumY,
      maximumZ,
      minimumX,
      minimumY: verticalRange.minimumY,
      minimumZ,
      polygon: [closeClippingRing(ring)],
    },
  ]
}

function verticalRangeBlocksLayer(
  range: Readonly<{ maximumY: number; minimumY: number }>,
  elevation: number,
) {
  return (
    range.maximumY > elevation + COLLISION_EPSILON_METERS &&
    range.minimumY < elevation + NAVIGATION_AGENT_HEIGHT_METERS - COLLISION_EPSILON_METERS
  )
}

function canonicalizeMultiPolygon(
  multiPolygon: MultiPolygon,
): readonly ZombieEscapeSparseObstacleFootprintComponent[] {
  const components = multiPolygon.flatMap((polygon) => {
    const outer = canonicalizeClippingRing(polygon[0], true)
    if (outer.length < 3) return []
    const holes = polygon
      .slice(1)
      .map((ring) => canonicalizeClippingRing(ring, false))
      .filter((ring) => ring.length >= 3)
      .sort(compareRings)
    return [{ holes, outer }]
  })
  return components.sort((first, second) => compareRings(first.outer, second.outer))
}

function canonicalizeClippingRing(ring: Ring | undefined, counterClockwise: boolean) {
  if (!ring) return []
  return canonicalizeRing(
    ring.map(([x, z]) => ({ x, z })),
    counterClockwise,
  )
}

function canonicalizeRing(
  rawRing: readonly ZombieEscapeSparseObstacleFootprintPoint[],
  counterClockwise: boolean,
) {
  const deduped: ZombieEscapeSparseObstacleFootprintPoint[] = []
  for (const rawPoint of rawRing) {
    const point = {
      x: normalizePolygonBooleanCoordinate(rawPoint.x),
      z: normalizePolygonBooleanCoordinate(rawPoint.z),
    }
    const previous = deduped[deduped.length - 1]
    if (previous && pointsMatch(previous, point)) continue
    deduped.push(point)
  }
  if (deduped.length > 2 && pointsMatch(deduped[0]!, deduped[deduped.length - 1]!)) {
    deduped.pop()
  }
  if (deduped.length < 3) return []
  if (signedArea(deduped) > 0 !== counterClockwise) deduped.reverse()
  let firstIndex = 0
  for (let index = 1; index < deduped.length; index += 1) {
    if (compareRingRotations(deduped, index, firstIndex) < 0) firstIndex = index
  }
  return [...deduped.slice(firstIndex), ...deduped.slice(0, firstIndex)]
}

function closeClippingRing(ring: readonly ZombieEscapeSparseObstacleFootprintPoint[]): Ring {
  return [...ring.map(({ x, z }) => [x, z] as [number, number]), [ring[0]!.x, ring[0]!.z]]
}

function comparePolygons(first: Polygon, second: Polygon) {
  return compareClippingRings(first[0], second[0])
}

function compareClippingRings(first: Ring | undefined, second: Ring | undefined) {
  return compareRings(canonicalizeClippingRing(first, true), canonicalizeClippingRing(second, true))
}

function compareRings(
  first: readonly ZombieEscapeSparseObstacleFootprintPoint[],
  second: readonly ZombieEscapeSparseObstacleFootprintPoint[],
) {
  const count = Math.min(first.length, second.length)
  for (let index = 0; index < count; index += 1) {
    const comparison = comparePoints(first[index]!, second[index]!)
    if (comparison !== 0) return comparison
  }
  return first.length - second.length
}

function compareRingRotations(
  ring: readonly ZombieEscapeSparseObstacleFootprintPoint[],
  firstStart: number,
  secondStart: number,
) {
  for (let offset = 0; offset < ring.length; offset += 1) {
    const comparison = comparePoints(
      ring[(firstStart + offset) % ring.length]!,
      ring[(secondStart + offset) % ring.length]!,
    )
    if (comparison !== 0) return comparison
  }
  return 0
}

function comparePoints(
  first: ZombieEscapeSparseObstacleFootprintPoint,
  second: ZombieEscapeSparseObstacleFootprintPoint,
) {
  return first.x - second.x || first.z - second.z
}

function signedArea(ring: readonly ZombieEscapeSparseObstacleFootprintPoint[]) {
  let area = 0
  for (let index = 0; index < ring.length; index += 1) {
    const point = ring[index]!
    const next = ring[(index + 1) % ring.length]!
    area += point.x * next.z - next.x * point.z
  }
  return area * 0.5
}

function pointsMatch(
  first: ZombieEscapeSparseObstacleFootprintPoint,
  second: ZombieEscapeSparseObstacleFootprintPoint,
) {
  return (
    Math.abs(first.x - second.x) <= GEOMETRY_EPSILON &&
    Math.abs(first.z - second.z) <= GEOMETRY_EPSILON
  )
}

function normalizeZero(value: number) {
  return Object.is(value, -0) ? 0 : value
}

function normalizePolygonBooleanCoordinate(value: number) {
  const latticeCoordinate = value / POLYGON_BOOLEAN_COORDINATE_QUANTUM_METERS
  if (
    !Number.isFinite(latticeCoordinate) ||
    Math.abs(latticeCoordinate) > Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError('Sparse obstacle coordinate exceeds the exact polygon-union range')
  }
  return normalizeZero(Math.round(latticeCoordinate) * POLYGON_BOOLEAN_COORDINATE_QUANTUM_METERS)
}
