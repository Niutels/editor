import polygonClipping, {
  type MultiPolygon,
  type Pair,
  type Polygon,
  type Ring,
} from 'polygon-clipping'
import { ShapeUtils, Vector2 } from 'three'
export type NaturalRoadPlanPoint = Readonly<{
  x: number
  z: number
}>

export type NaturalRoadPlanVec3 = readonly [number, number, number]

export type NaturalRoadPlanRoadSegment = Readonly<{
  connectsParcelIds: readonly string[]
  fromNodeId: string
  id: string
  kind: 'driveway' | 'spine'
  points: readonly NaturalRoadPlanPoint[]
  r3fPoints: readonly NaturalRoadPlanVec3[]
  toNodeId: string
  width: number
}>

export type NaturalRoadQuality = 'balanced' | 'high'
export type NaturalRoadSeed = 'cala' | 'capri' | 'corsica'
type NaturalRoadFootprints = {
  asphalt: MultiPolygon
  centerDashes: MultiPolygon
  clearance: MultiPolygon
  edgeLines: MultiPolygon
  outerSidewalk: MultiPolygon
  perimeterSidewalk: MultiPolygon
  roadSidewalks: MultiPolygon
  sidewalks: MultiPolygon
}

type NaturalRoadNode = {
  degree: number
  id: string
  position: NaturalRoadPlanPoint
}

export type NaturalRoadWidthProbe = {
  center: NaturalRoadPlanPoint
  distanceMeters: number
  negativeBoundary: NaturalRoadPlanPoint
  negativeHalfWidthMeters: number
  positiveBoundary: NaturalRoadPlanPoint
  positiveHalfWidthMeters: number
  requiredHalfWidthMeters: number
  roadId: string
  segmentIndex: number
  status: 'junction' | 'nominal' | 'non-parallel' | 'under-width'
}

export type NaturalRoadGeometryAudit = {
  boundaryFailures: readonly {
    point: NaturalRoadPlanPoint
    turnDegrees: number
  }[]
  failureCount: number
  maximumBoundaryTurnDegrees: number
  maximumParallelDeviationMeters: number
  minimumHalfWidthMeters: number
  probes: readonly NaturalRoadWidthProbe[]
  requiredHalfWidthMeters: number
  sampleCount: number
  worstPoint: NaturalRoadPlanPoint
}

export type NaturalRoadPlan = {
  footprints: NaturalRoadFootprints
  groundElevation: number
  metrics: {
    buildTimeMs: number
    endpointCount: number
    estimatedTriangleCount: number
    estimatedVertexCount: number
    footprintVertexCount: number
    junctionCount: number
    nodeCount: number
    perimeterSidewalkSegmentCount: number
    routeLengthMeters: number
    segmentCount: number
    sidewalkOffsetAudit: {
      excessMeters: number
      expectedMeters: number
      maximumAbsoluteErrorMeters: number
      maximumMeters: number
      minimumMeters: number
      point: NaturalRoadPlanPoint
    }
  }
  nodes: readonly NaturalRoadNode[]
  perimeterSidewalkPoints: readonly NaturalRoadPlanPoint[]
  perimeterSidewalkRoadIds: readonly string[]
  quality: NaturalRoadQuality
  roadGeometryAudit: NaturalRoadGeometryAudit
  roadWidths: Readonly<Record<string, number>>
  roads: readonly NaturalRoadPlanRoadSegment[]
  seed: NaturalRoadSeed
}

export const NATURAL_ROAD_STYLE = {
  carriageway: {
    intersectionCornerRadiusMeters: 1,
    surfaceOffsetMeters: 0.03,
    widthMeters: 2.15,
  },
  markings: {
    centerDashLengthMeters: 2.4,
    centerDashPeriodMeters: 4.7,
    centerLineWidthMeters: 0.075,
    edgeLineWidthMeters: 0.055,
    junctionClearanceMeters: 1.35,
    perimeterRetreatMeters: 0.42,
  },
  sidewalk: {
    curbHeightMeters: 0.15,
    curbRoundoverRadiusMeters: 0.045,
    grassClearanceMeters: 0.08,
    perimeterThicknessMeters: 1.55,
    roadEdgeBumpHeightMeters: 0.022,
    roadEdgeBumpWidthMeters: 0.085,
    widthMeters: 0.5,
  },
} as const

const NATURAL_ROAD_BOOLEAN_LEAF_SIZE = 12
const NATURAL_ROAD_MIN_POLYGON_AREA = 0.0001
const NATURAL_ROAD_MIN_WIDTH_METERS = 0.08
const NATURAL_ROAD_PERIMETER_MATCH_TOLERANCE_METERS = 0.45
const NATURAL_ROAD_WIDTH_AUDIT_SAMPLE_SPACING_METERS = 0.2
const NATURAL_ROAD_WIDTH_AUDIT_TOLERANCE_METERS = 0.01
const NATURAL_ROAD_PARALLEL_AUDIT_TOLERANCE_METERS = 0.02
const NATURAL_ROAD_BOUNDARY_TURN_LIMIT_DEGREES = 38
const NATURAL_ROAD_SNAP_SCALE = 10_000

export type NaturalRoadPlanInput = Readonly<{
  elevation: number
  perimeter: readonly NaturalRoadPlanPoint[]
  quality: NaturalRoadQuality
  roads: readonly NaturalRoadPlanRoadSegment[]
  seed: NaturalRoadSeed
}>

export function createNaturalRoadPlan({
  elevation,
  perimeter,
  quality,
  roads,
  seed,
}: NaturalRoadPlanInput): NaturalRoadPlan {
  const buildStartedAt = currentTimeMilliseconds()
  const roundSegments = quality === 'high' ? 16 : 12
  const cleanedRoads = roads
    .map<NaturalRoadPlanRoadSegment>((road) => ({
      ...road,
      points: cleanRoadPoints(road.points),
    }))
    .filter((road) => road.points.length >= 2)
  const roadWidths = Object.fromEntries(
    cleanedRoads.map((road) => [road.id, NATURAL_ROAD_STYLE.carriageway.widthMeters]),
  )
  const widthForRoad = (road: NaturalRoadPlanRoadSegment) =>
    roadWidths[road.id] ?? NATURAL_ROAD_STYLE.carriageway.widthMeters
  const nodes = createNaturalRoadNodes(cleanedRoads)
  const perimeterSidewalkPoints = closedRoadPoints(perimeter)
  const islandPolygon = perimeterPolygon(perimeterSidewalkPoints)
  const perimeterSidewalkRoads = cleanedRoads.filter((road) =>
    isIslandPerimeterRoad(road, perimeterSidewalkPoints),
  )
  const perimeterSidewalkRoadIds = new Set(perimeterSidewalkRoads.map((road) => road.id))
  const interiorRoads = cleanedRoads.filter((road) => !perimeterSidewalkRoadIds.has(road.id))
  const clippedFootprint = (
    footprintRoads: readonly NaturalRoadPlanRoadSegment[],
    width: (road: NaturalRoadPlanRoadSegment) => number,
  ) => {
    const halfWidthExpansions = footprintRoads.map((road) => (width(road) - widthForRoad(road)) / 2)
    const maximumHalfWidthExpansion =
      halfWidthExpansions.length > 0 ? Math.max(...halfWidthExpansions) : 0
    const concentricCornerRadius = Math.max(
      0,
      NATURAL_ROAD_STYLE.carriageway.intersectionCornerRadiusMeters - maximumHalfWidthExpansion,
    )
    return closeFootprintCorners(
      clipFootprint(bufferedRoadFootprint(footprintRoads, width, roundSegments), islandPolygon),
      islandPolygon,
      concentricCornerRadius,
      roundSegments,
    )
  }

  const perimeterSidewalk = inwardPerimeterBand({
    islandPolygon,
    perimeter: perimeterSidewalkPoints,
    roundSegments,
    thickness: NATURAL_ROAD_STYLE.sidewalk.perimeterThicknessMeters,
  })
  const asphaltSource = clippedFootprint(interiorRoads, widthForRoad)
  const roadGeometryAudit = auditNaturalRoadGeometry({
    asphalt: asphaltSource,
    perimeter: perimeterSidewalkPoints,
    roads: interiorRoads,
    roadWidths,
  })
  const asphalt = differenceFootprint(asphaltSource, perimeterSidewalk)
  const innerAsphaltSource = clippedFootprint(interiorRoads, (road) =>
    Math.max(
      NATURAL_ROAD_MIN_WIDTH_METERS,
      widthForRoad(road) - NATURAL_ROAD_STYLE.markings.edgeLineWidthMeters * 2,
    ),
  )
  const innerAsphalt = differenceFootprint(innerAsphaltSource, perimeterSidewalk)
  const interiorOuterSidewalk = clippedFootprint(
    interiorRoads,
    (road) => widthForRoad(road) + NATURAL_ROAD_STYLE.sidewalk.widthMeters * 2,
  )
  const outerSidewalk = unionFootprints(interiorOuterSidewalk, perimeterSidewalk)
  const roadSidewalks = differenceFootprint(
    differenceFootprint(interiorOuterSidewalk, asphalt),
    perimeterSidewalk,
  )
  const interiorClearance = clippedFootprint(
    interiorRoads,
    (road) =>
      widthForRoad(road) +
      (NATURAL_ROAD_STYLE.sidewalk.widthMeters + NATURAL_ROAD_STYLE.sidewalk.grassClearanceMeters) *
        2,
  )
  const perimeterClearance = inwardPerimeterBand({
    islandPolygon,
    perimeter: perimeterSidewalkPoints,
    roundSegments,
    thickness:
      NATURAL_ROAD_STYLE.sidewalk.perimeterThicknessMeters +
      NATURAL_ROAD_STYLE.sidewalk.grassClearanceMeters,
  })
  const clearance = unionFootprints(interiorClearance, perimeterClearance)
  const perimeterMarkingExclusion = inwardPerimeterBand({
    islandPolygon,
    perimeter: perimeterSidewalkPoints,
    roundSegments,
    thickness:
      NATURAL_ROAD_STYLE.sidewalk.perimeterThicknessMeters +
      NATURAL_ROAD_STYLE.markings.perimeterRetreatMeters,
  })
  const sidewalks = unionFootprints(perimeterSidewalk, roadSidewalks)
  const edgeLines = differenceFootprint(
    differenceFootprint(asphalt, innerAsphalt),
    perimeterMarkingExclusion,
  )
  const centerDashes = differenceFootprint(
    createCenterDashFootprint({
      asphalt,
      nodes,
      quality,
      roads: interiorRoads,
      seed,
    }),
    perimeterMarkingExclusion,
  )
  const footprints = {
    asphalt,
    centerDashes,
    clearance,
    edgeLines,
    outerSidewalk,
    perimeterSidewalk,
    roadSidewalks,
    sidewalks,
  }
  const metrics = finalGeometryMetrics(footprints, quality)
  const sidewalkOffsetAudit = auditFootprintOffset(
    interiorOuterSidewalk,
    asphaltSource,
    NATURAL_ROAD_STYLE.sidewalk.widthMeters,
    perimeterSidewalkPoints,
    NATURAL_ROAD_STYLE.sidewalk.perimeterThicknessMeters + NATURAL_ROAD_STYLE.sidewalk.widthMeters,
  )

  return {
    footprints,
    groundElevation: elevation,
    metrics: {
      buildTimeMs: currentTimeMilliseconds() - buildStartedAt,
      endpointCount: nodes.filter((node) => node.degree === 1).length,
      estimatedTriangleCount: metrics.triangles,
      estimatedVertexCount: metrics.vertices,
      footprintVertexCount: footprintVertexCount(outerSidewalk) + footprintVertexCount(asphalt),
      junctionCount: nodes.filter((node) => node.degree >= 3).length,
      nodeCount: nodes.length,
      perimeterSidewalkSegmentCount: perimeterSidewalkRoads.length,
      routeLengthMeters: cleanedRoads.reduce(
        (total, road) => total + polylineLength(road.points),
        0,
      ),
      segmentCount: cleanedRoads.length,
      sidewalkOffsetAudit,
    },
    nodes,
    perimeterSidewalkPoints,
    perimeterSidewalkRoadIds: [...perimeterSidewalkRoadIds].sort(),
    quality,
    roadGeometryAudit,
    roadWidths,
    roads: cleanedRoads,
    seed,
  }
}

export function createNaturalRoadMaskSegments(
  plan: NaturalRoadPlan,
  widthScale = 1,
): readonly NaturalRoadPlanRoadSegment[] {
  const y = asphaltY(plan)
  const scale = Math.max(0.01, widthScale)
  const perimeterSidewalkRoadIds = new Set(plan.perimeterSidewalkRoadIds)
  const maskRoads = plan.roads
    .filter((road) => !perimeterSidewalkRoadIds.has(road.id))
    .map((road) => ({
      ...road,
      points: [...road.points],
      r3fPoints: road.points.map((point) => [point.x, y, point.z] satisfies NaturalRoadPlanVec3),
      width:
        ((plan.roadWidths[road.id] ?? NATURAL_ROAD_STYLE.carriageway.widthMeters) +
          (NATURAL_ROAD_STYLE.sidewalk.widthMeters +
            NATURAL_ROAD_STYLE.sidewalk.grassClearanceMeters) *
            2) *
        scale,
    }))
  if (perimeterSidewalkRoadIds.size === 0 || plan.perimeterSidewalkPoints.length < 2) {
    return maskRoads
  }
  return [
    ...maskRoads,
    {
      connectsParcelIds: [],
      fromNodeId: 'natural-road-perimeter-sidewalk-loop',
      id: `natural-road-perimeter-sidewalk-mask-${plan.quality}`,
      kind: 'spine',
      points: [...plan.perimeterSidewalkPoints],
      r3fPoints: plan.perimeterSidewalkPoints.map(
        (point) => [point.x, y, point.z] satisfies NaturalRoadPlanVec3,
      ),
      toNodeId: 'natural-road-perimeter-sidewalk-loop',
      width:
        (NATURAL_ROAD_STYLE.sidewalk.perimeterThicknessMeters +
          NATURAL_ROAD_STYLE.sidewalk.grassClearanceMeters) *
        2 *
        scale,
    },
  ]
}

export function naturalRoadSidewalkContainsFootprint(
  plan: NaturalRoadPlan,
  footprint: readonly NaturalRoadPlanPoint[],
) {
  if (footprint.length < 3 || plan.footprints.roadSidewalks.length === 0) return false
  const ring = closedRing(footprint.map(pointPair))
  if (ring.length < 4) return false
  return polygonClipping.difference([ring], plan.footprints.roadSidewalks).length === 0
}

function createCenterDashFootprint({
  asphalt,
  nodes,
  quality,
  roads,
  seed,
}: {
  asphalt: MultiPolygon
  nodes: readonly NaturalRoadNode[]
  quality: NaturalRoadQuality
  roads: readonly NaturalRoadPlanRoadSegment[]
  seed: NaturalRoadSeed
}) {
  const roundSegments = quality === 'high' ? 10 : 6
  const dashPolygons: Polygon[] = []
  const period = NATURAL_ROAD_STYLE.markings.centerDashPeriodMeters
  const dashLength = NATURAL_ROAD_STYLE.markings.centerDashLengthMeters

  for (const road of roads) {
    const phase = hashUnit(`${seed}:${road.id}:dashes`) * period
    let distanceOffset = 0
    for (let index = 0; index < road.points.length - 1; index += 1) {
      const start = road.points[index]
      const end = road.points[index + 1]
      if (!(start && end)) continue
      const dx = end.x - start.x
      const dz = end.z - start.z
      const length = Math.hypot(dx, dz)
      if (length <= 0.0001) continue
      const segmentStart = distanceOffset
      const segmentEnd = distanceOffset + length
      const firstDash = Math.floor((segmentStart - phase) / period) - 1
      const lastDash = Math.ceil((segmentEnd - phase) / period) + 1

      for (let dashIndex = firstDash; dashIndex <= lastDash; dashIndex += 1) {
        const dashStart = Math.max(segmentStart, phase + dashIndex * period)
        const dashEnd = Math.min(segmentEnd, phase + dashIndex * period + dashLength)
        if (dashEnd - dashStart <= 0.04) continue
        const localStart = (dashStart - segmentStart) / length
        const localEnd = (dashEnd - segmentStart) / length
        const capsule = segmentCapsule(
          { x: start.x + dx * localStart, z: start.z + dz * localStart },
          { x: start.x + dx * localEnd, z: start.z + dz * localEnd },
          NATURAL_ROAD_STYLE.markings.centerLineWidthMeters / 2,
          roundSegments,
        )
        if (capsule) dashPolygons.push(capsule)
      }
      distanceOffset = segmentEnd
    }
  }

  const dashed = intersectFootprint(unionPolygons(dashPolygons), asphalt)
  const junctionCutouts = unionPolygons(
    nodes
      .filter((node) => node.degree >= 3)
      .map((node) =>
        circlePolygon(
          node.position,
          NATURAL_ROAD_STYLE.markings.junctionClearanceMeters,
          roundSegments,
        ),
      ),
  )
  return differenceFootprint(dashed, junctionCutouts)
}

function createNaturalRoadNodes(roads: readonly NaturalRoadPlanRoadSegment[]) {
  const nodeMap = new Map<string, NaturalRoadNode>()
  for (const road of roads) {
    const start = road.points[0]
    const end = road.points.at(-1)
    if (start) addNaturalRoadNode(nodeMap, road.fromNodeId, start)
    if (end) addNaturalRoadNode(nodeMap, road.toNodeId, end)
  }
  return [...nodeMap.values()].sort((first, second) => first.id.localeCompare(second.id))
}

function addNaturalRoadNode(
  nodes: Map<string, NaturalRoadNode>,
  id: string,
  position: NaturalRoadPlanPoint,
) {
  const current = nodes.get(id)
  if (current) {
    current.degree += 1
    return
  }
  nodes.set(id, { degree: 1, id, position: { x: position.x, z: position.z } })
}

function bufferedRoadFootprint(
  roads: readonly NaturalRoadPlanRoadSegment[],
  widthForRoad: (road: NaturalRoadPlanRoadSegment) => number,
  roundSegments: number,
) {
  const shapes: Polygon[] = []
  const seenSegments = new Set<string>()
  for (const road of roads) {
    const radius = Math.max(NATURAL_ROAD_MIN_WIDTH_METERS, widthForRoad(road)) / 2
    const points = cleanRoadPoints(road.points)
    if (points.length === 1 && points[0]) {
      shapes.push(circlePolygon(points[0], radius, roundSegments))
    }
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index]
      const end = points[index + 1]
      if (!(start && end)) continue
      const signature = segmentSignature(start, end, radius)
      if (seenSegments.has(signature)) continue
      seenSegments.add(signature)
      const capsule = segmentCapsule(start, end, radius, roundSegments)
      if (capsule) shapes.push(capsule)
    }
  }
  return unionPolygons(shapes)
}

function inwardPerimeterBand({
  islandPolygon,
  perimeter,
  roundSegments,
  thickness,
}: {
  islandPolygon: Polygon
  perimeter: readonly NaturalRoadPlanPoint[]
  roundSegments: number
  thickness: number
}) {
  if (perimeter.length < 2 || thickness <= 0) return []
  return clipFootprint(
    bufferedPolylineFootprint(perimeter, thickness * 2, roundSegments),
    islandPolygon,
  )
}

function bufferedPolylineFootprint(
  points: readonly NaturalRoadPlanPoint[],
  width: number,
  roundSegments: number,
) {
  const radius = Math.max(NATURAL_ROAD_MIN_WIDTH_METERS, width) / 2
  const closedPoints = closedRoadPoints(points)
  const shapes: Polygon[] = []
  for (let index = 0; index < closedPoints.length - 1; index += 1) {
    const start = closedPoints[index]
    const end = closedPoints[index + 1]
    if (!(start && end)) continue
    const capsule = segmentCapsule(start, end, radius, roundSegments)
    if (capsule) shapes.push(capsule)
  }
  return unionPolygons(shapes)
}

function expandFootprint(area: MultiPolygon, distance: number, roundSegments: number) {
  if (area.length === 0 || distance <= 0.0001) return area
  const boundaryShapes: Polygon[] = []
  for (const polygon of area) {
    for (const ring of polygon) {
      const opened = openRing(ring)
      for (let index = 0; index < opened.length; index += 1) {
        const start = opened[index]
        const end = opened[(index + 1) % opened.length]
        if (!(start && end)) continue
        const capsule = segmentCapsule(
          { x: start[0], z: start[1] },
          { x: end[0], z: end[1] },
          distance,
          roundSegments,
        )
        if (capsule) boundaryShapes.push(capsule)
      }
    }
  }
  return unionFootprints(area, unionPolygons(boundaryShapes))
}

function closeFootprintCorners(
  area: MultiPolygon,
  islandPolygon: Polygon,
  distance: number,
  roundSegments: number,
) {
  if (area.length === 0 || distance <= 0.0001) return area
  const islandArea = cleanMultiPolygon([islandPolygon])
  const expandedRoad = clipFootprint(expandFootprint(area, distance, roundSegments), islandPolygon)
  const expandedNonRoad = clipFootprint(
    expandFootprint(differenceFootprint(islandArea, expandedRoad), distance, roundSegments),
    islandPolygon,
  )
  return unionFootprints(area, differenceFootprint(islandArea, expandedNonRoad))
}

function unionPolygons(shapes: readonly Polygon[]) {
  const operands = shapes.flatMap((shape, order) => {
    const area = cleanMultiPolygon([shape])
    const bounds = footprintBounds(area)
    return bounds ? [{ area, bounds, order }] : []
  })
  return unionPolygonOperands(operands)
}

type NaturalRoadUnionOperand = {
  area: MultiPolygon
  bounds: { maxX: number; maxZ: number; minX: number; minZ: number }
  order: number
}

function unionPolygonOperands(operands: readonly NaturalRoadUnionOperand[]): MultiPolygon {
  const first = operands[0]
  if (!first) return []
  if (operands.length <= NATURAL_ROAD_BOOLEAN_LEAF_SIZE) {
    return cleanMultiPolygon(
      polygonClipping.union(first.area, ...operands.slice(1).map((operand) => operand.area)),
    )
  }

  const bounds = operands.reduce(
    (combined, operand) => ({
      maxX: Math.max(combined.maxX, operand.bounds.maxX),
      maxZ: Math.max(combined.maxZ, operand.bounds.maxZ),
      minX: Math.min(combined.minX, operand.bounds.minX),
      minZ: Math.min(combined.minZ, operand.bounds.minZ),
    }),
    { maxX: -Infinity, maxZ: -Infinity, minX: Infinity, minZ: Infinity },
  )
  const splitOnX = bounds.maxX - bounds.minX >= bounds.maxZ - bounds.minZ
  const center = (operand: NaturalRoadUnionOperand, xAxis: boolean) =>
    xAxis
      ? (operand.bounds.minX + operand.bounds.maxX) / 2
      : (operand.bounds.minZ + operand.bounds.maxZ) / 2
  const ordered = [...operands].sort((left, right) => {
    const primary = center(left, splitOnX) - center(right, splitOnX)
    if (primary !== 0) return primary
    const secondary = center(left, !splitOnX) - center(right, !splitOnX)
    return secondary !== 0 ? secondary : left.order - right.order
  })
  const midpoint = Math.ceil(ordered.length / 2)
  const left = unionPolygonOperands(ordered.slice(0, midpoint))
  const right = unionPolygonOperands(ordered.slice(midpoint))
  if (left.length === 0) return right
  if (right.length === 0) return left
  return cleanMultiPolygon(polygonClipping.union(left, right))
}

function clipFootprint(footprint: MultiPolygon, islandPolygon: Polygon) {
  if (footprint.length === 0 || islandPolygon.length === 0) return []
  return cleanMultiPolygon(polygonClipping.intersection(footprint, islandPolygon))
}

function intersectFootprint(first: MultiPolygon, second: MultiPolygon) {
  if (first.length === 0 || second.length === 0) return []
  return cleanMultiPolygon(polygonClipping.intersection(first, second))
}

function differenceFootprint(subject: MultiPolygon, clipping: MultiPolygon) {
  if (subject.length === 0) return []
  if (clipping.length === 0) return subject
  return cleanMultiPolygon(polygonClipping.difference(subject, clipping))
}

function unionFootprints(...footprints: readonly MultiPolygon[]) {
  const populated = footprints.filter((footprint) => footprint.length > 0)
  const first = populated[0]
  if (!first) return []
  return cleanMultiPolygon(polygonClipping.union(first, ...populated.slice(1)))
}

function perimeterPolygon(perimeter: readonly NaturalRoadPlanPoint[]): Polygon {
  const ring = closedRing(cleanRoadPoints(perimeter).map(pointPair))
  return ring.length >= 4 ? [ring] : []
}

function circlePolygon(
  point: NaturalRoadPlanPoint,
  radius: number,
  roundSegments: number,
): Polygon {
  const ring: Ring = []
  const segmentCount = Math.max(6, roundSegments)
  for (let index = 0; index < segmentCount; index += 1) {
    const angle = (index / segmentCount) * Math.PI * 2
    ring.push(snappedPair(point.x + Math.cos(angle) * radius, point.z + Math.sin(angle) * radius))
  }
  return [closedRing(ring)]
}

function segmentCapsule(
  start: NaturalRoadPlanPoint,
  end: NaturalRoadPlanPoint,
  radius: number,
  roundSegments: number,
): Polygon | null {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const length = Math.hypot(dx, dz)
  if (length <= 0.0001) return null
  const heading = Math.atan2(dz, dx)
  const capSegments = Math.max(3, Math.floor(roundSegments / 2))
  const ring: Ring = []
  for (let index = 0; index <= capSegments; index += 1) {
    const angle = heading + Math.PI / 2 - (index / capSegments) * Math.PI
    ring.push(snappedPair(end.x + Math.cos(angle) * radius, end.z + Math.sin(angle) * radius))
  }
  for (let index = 0; index <= capSegments; index += 1) {
    const angle = heading - Math.PI / 2 - (index / capSegments) * Math.PI
    ring.push(snappedPair(start.x + Math.cos(angle) * radius, start.z + Math.sin(angle) * radius))
  }
  return [closedRing(ring)]
}

function finalGeometryMetrics(footprints: NaturalRoadFootprints, quality: NaturalRoadQuality) {
  const surfaceAreas = [
    footprints.sidewalks,
    footprints.asphalt,
    footprints.edgeLines,
    footprints.centerDashes,
  ]
  const surfaceVertices = surfaceAreas.reduce(
    (total, footprint) => total + footprintVertexCount(footprint),
    0,
  )
  const outerWallEdges = footprintVertexCount(footprints.outerSidewalk)
  const roadFacingWallEdges = footprintVertexCount(footprints.asphalt)
  const roundedProfileSegments = quality === 'high' ? 6 : 4
  return {
    triangles:
      surfaceAreas.reduce((total, footprint) => total + surfaceTriangleCount(footprint), 0) +
      outerWallEdges * (roundedProfileSegments + 1) * 2 +
      roadFacingWallEdges * (roundedProfileSegments * 2 + 1) * 2,
    vertices:
      surfaceVertices +
      outerWallEdges * (roundedProfileSegments + 2) +
      roadFacingWallEdges * (roundedProfileSegments * 2 + 2),
  }
}

function surfaceTriangleCount(area: MultiPolygon) {
  let count = 0
  for (const polygon of area) {
    const rings = polygon.map(openRing).filter((ring) => ring.length >= 3)
    const contour = rings[0]
    if (!contour) continue
    count += ShapeUtils.triangulateShape(
      contour.map(([x, z]) => new Vector2(x, z)),
      rings.slice(1).map((ring) => ring.map(([x, z]) => new Vector2(x, z))),
    ).length
  }
  return count
}

function footprintVertexCount(area: MultiPolygon) {
  return area.reduce(
    (total, polygon) =>
      total + polygon.reduce((polygonTotal, ring) => polygonTotal + openRing(ring).length, 0),
    0,
  )
}

function asphaltY(plan: NaturalRoadPlan) {
  return plan.groundElevation + NATURAL_ROAD_STYLE.carriageway.surfaceOffsetMeters
}

function sidewalkY(plan: NaturalRoadPlan) {
  return asphaltY(plan) + NATURAL_ROAD_STYLE.sidewalk.curbHeightMeters
}

function polylineLength(points: readonly NaturalRoadPlanPoint[]) {
  let length = 0
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    if (start && end) length += Math.hypot(end.x - start.x, end.z - start.z)
  }
  return length
}

function isIslandPerimeterRoad(
  road: NaturalRoadPlanRoadSegment,
  perimeter: readonly NaturalRoadPlanPoint[],
) {
  if (road.connectsParcelIds.length !== 1 || road.points.length < 2) return false
  return road.points.every(
    (point) =>
      pointToPerimeterDistance(point, perimeter) <= NATURAL_ROAD_PERIMETER_MATCH_TOLERANCE_METERS,
  )
}

function pointToPerimeterDistance(
  point: NaturalRoadPlanPoint,
  perimeter: readonly NaturalRoadPlanPoint[],
) {
  if (perimeter.length < 2) return Number.POSITIVE_INFINITY
  const first = perimeter[0]
  const last = perimeter.at(-1)
  const closed = first && last && Math.hypot(first.x - last.x, first.z - last.z) <= 0.0001
  const edgeCount = closed ? perimeter.length - 1 : perimeter.length
  let minimumDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < edgeCount; index += 1) {
    const start = perimeter[index]
    const end = perimeter[(index + 1) % perimeter.length]
    if (!(start && end)) continue
    minimumDistance = Math.min(minimumDistance, pointToSegmentDistance(point, start, end))
  }
  return minimumDistance
}

function pointToSegmentDistance(
  point: NaturalRoadPlanPoint,
  start: NaturalRoadPlanPoint,
  end: NaturalRoadPlanPoint,
) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared <= 0.0000001) return Math.hypot(point.x - start.x, point.z - start.z)
  const projection = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared),
  )
  return Math.hypot(point.x - (start.x + dx * projection), point.z - (start.z + dz * projection))
}

export function auditNaturalRoadGeometry({
  asphalt,
  perimeter,
  roads,
  roadWidths,
}: {
  asphalt: MultiPolygon
  perimeter: readonly NaturalRoadPlanPoint[]
  roads: readonly NaturalRoadPlanRoadSegment[]
  roadWidths: Readonly<Record<string, number>>
}) {
  return auditRoadGeometry({
    asphalt,
    perimeter,
    roads,
    widthForRoad: (road) => roadWidths[road.id] ?? NATURAL_ROAD_STYLE.carriageway.widthMeters,
  })
}

function auditRoadGeometry({
  asphalt,
  perimeter,
  roads,
  widthForRoad,
}: {
  asphalt: MultiPolygon
  perimeter: readonly NaturalRoadPlanPoint[]
  roads: readonly NaturalRoadPlanRoadSegment[]
  widthForRoad: (road: NaturalRoadPlanRoadSegment) => number
}): NaturalRoadGeometryAudit {
  const probes: NaturalRoadWidthProbe[] = []
  const joinInfluences = createRoadJoinInfluences(roads, widthForRoad)
  const perimeterExclusionMeters =
    NATURAL_ROAD_STYLE.sidewalk.perimeterThicknessMeters +
    NATURAL_ROAD_STYLE.carriageway.widthMeters / 2 +
    NATURAL_ROAD_WIDTH_AUDIT_TOLERANCE_METERS
  const joinInfluenceMeters =
    NATURAL_ROAD_STYLE.carriageway.intersectionCornerRadiusMeters +
    NATURAL_ROAD_STYLE.carriageway.widthMeters / 2 +
    NATURAL_ROAD_WIDTH_AUDIT_SAMPLE_SPACING_METERS

  for (const road of roads) {
    const requiredHalfWidth = widthForRoad(road) / 2
    let roadDistance = 0
    for (let segmentIndex = 0; segmentIndex < road.points.length - 1; segmentIndex += 1) {
      const start = road.points[segmentIndex]
      const end = road.points[segmentIndex + 1]
      if (!(start && end)) continue
      const dx = end.x - start.x
      const dz = end.z - start.z
      const segmentLength = Math.hypot(dx, dz)
      if (segmentLength <= 0.0001) continue
      const normal = { x: -dz / segmentLength, z: dx / segmentLength }
      const sampleCount = Math.max(
        1,
        Math.ceil(segmentLength / NATURAL_ROAD_WIDTH_AUDIT_SAMPLE_SPACING_METERS),
      )
      for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
        if (segmentIndex > 0 && sampleIndex === 0) continue
        const progress = sampleIndex / sampleCount
        const center = {
          x: start.x + dx * progress,
          z: start.z + dz * progress,
        }
        if (pointToPerimeterDistance(center, perimeter) <= perimeterExclusionMeters) continue
        const positiveHalfWidthMeters = rayToFootprintBoundaryDistance(center, normal, asphalt)
        const negativeHalfWidthMeters = rayToFootprintBoundaryDistance(
          center,
          { x: -normal.x, z: -normal.z },
          asphalt,
        )
        if (
          !(Number.isFinite(positiveHalfWidthMeters) && Number.isFinite(negativeHalfWidthMeters))
        ) {
          continue
        }
        const minimumHalfWidth = Math.min(positiveHalfWidthMeters, negativeHalfWidthMeters)
        const nearJoin = joinInfluences.some(
          (influence) =>
            Math.hypot(center.x - influence.point.x, center.z - influence.point.z) <=
            Math.max(joinInfluenceMeters, influence.radiusMeters),
        )
        const parallelDeviation = Math.max(
          Math.abs(positiveHalfWidthMeters - requiredHalfWidth),
          Math.abs(negativeHalfWidthMeters - requiredHalfWidth),
        )
        const status: NaturalRoadWidthProbe['status'] =
          minimumHalfWidth < requiredHalfWidth - NATURAL_ROAD_WIDTH_AUDIT_TOLERANCE_METERS
            ? 'under-width'
            : nearJoin
              ? 'junction'
              : parallelDeviation > NATURAL_ROAD_PARALLEL_AUDIT_TOLERANCE_METERS
                ? 'non-parallel'
                : 'nominal'
        probes.push({
          center,
          distanceMeters: roadDistance + segmentLength * progress,
          negativeBoundary: {
            x: center.x - normal.x * negativeHalfWidthMeters,
            z: center.z - normal.z * negativeHalfWidthMeters,
          },
          negativeHalfWidthMeters,
          positiveBoundary: {
            x: center.x + normal.x * positiveHalfWidthMeters,
            z: center.z + normal.z * positiveHalfWidthMeters,
          },
          positiveHalfWidthMeters,
          requiredHalfWidthMeters: requiredHalfWidth,
          roadId: road.id,
          segmentIndex,
          status,
        })
      }
      roadDistance += segmentLength
    }
  }

  const boundaryFailures: { point: NaturalRoadPlanPoint; turnDegrees: number }[] = []
  let maximumBoundaryTurnDegrees = 0
  for (const polygon of asphalt) {
    for (const ring of polygon) {
      const opened = openRing(ring)
      for (let index = 0; index < opened.length; index += 1) {
        const previous = opened[(index - 1 + opened.length) % opened.length]
        const current = opened[index]
        const next = opened[(index + 1) % opened.length]
        if (!(previous && current && next)) continue
        const incomingX = current[0] - previous[0]
        const incomingZ = current[1] - previous[1]
        const outgoingX = next[0] - current[0]
        const outgoingZ = next[1] - current[1]
        const incomingLength = Math.hypot(incomingX, incomingZ)
        const outgoingLength = Math.hypot(outgoingX, outgoingZ)
        if (incomingLength <= 0.0001 || outgoingLength <= 0.0001) continue
        const turnDegrees = Math.abs(
          (Math.atan2(
            incomingX * outgoingZ - incomingZ * outgoingX,
            incomingX * outgoingX + incomingZ * outgoingZ,
          ) *
            180) /
            Math.PI,
        )
        const point = { x: current[0], z: current[1] }
        if (pointToPerimeterDistance(point, perimeter) <= perimeterExclusionMeters) continue
        maximumBoundaryTurnDegrees = Math.max(maximumBoundaryTurnDegrees, turnDegrees)
        if (turnDegrees > NATURAL_ROAD_BOUNDARY_TURN_LIMIT_DEGREES) {
          boundaryFailures.push({ point, turnDegrees })
        }
      }
    }
  }

  const failedProbes = probes.filter(
    (probe) => probe.status === 'non-parallel' || probe.status === 'under-width',
  )
  const minimumProbe = probes.reduce<NaturalRoadWidthProbe | null>(
    (minimum, probe) =>
      !minimum ||
      Math.min(probe.negativeHalfWidthMeters, probe.positiveHalfWidthMeters) <
        Math.min(minimum.negativeHalfWidthMeters, minimum.positiveHalfWidthMeters)
        ? probe
        : minimum,
    null,
  )
  const maximumDeviationProbe = probes.reduce<NaturalRoadWidthProbe | null>((maximum, probe) => {
    if (probe.status !== 'nominal' && probe.status !== 'non-parallel') return maximum
    const deviation = Math.max(
      Math.abs(probe.negativeHalfWidthMeters - probe.requiredHalfWidthMeters),
      Math.abs(probe.positiveHalfWidthMeters - probe.requiredHalfWidthMeters),
    )
    if (!maximum) return probe
    const maximumDeviation = Math.max(
      Math.abs(maximum.negativeHalfWidthMeters - maximum.requiredHalfWidthMeters),
      Math.abs(maximum.positiveHalfWidthMeters - maximum.requiredHalfWidthMeters),
    )
    return deviation > maximumDeviation ? probe : maximum
  }, null)
  const maximumParallelDeviationMeters = maximumDeviationProbe
    ? Math.max(
        Math.abs(
          maximumDeviationProbe.negativeHalfWidthMeters -
            maximumDeviationProbe.requiredHalfWidthMeters,
        ),
        Math.abs(
          maximumDeviationProbe.positiveHalfWidthMeters -
            maximumDeviationProbe.requiredHalfWidthMeters,
        ),
      )
    : 0
  const firstBoundaryFailure = boundaryFailures[0]
  const worstPoint = failedProbes.find((probe) => probe.status === 'under-width')?.center ??
    failedProbes[0]?.center ??
    firstBoundaryFailure?.point ??
    minimumProbe?.center ?? { x: 0, z: 0 }

  return {
    boundaryFailures,
    failureCount: failedProbes.length + boundaryFailures.length,
    maximumBoundaryTurnDegrees,
    maximumParallelDeviationMeters,
    minimumHalfWidthMeters: minimumProbe
      ? Math.min(minimumProbe.negativeHalfWidthMeters, minimumProbe.positiveHalfWidthMeters)
      : NATURAL_ROAD_STYLE.carriageway.widthMeters / 2,
    probes,
    requiredHalfWidthMeters: NATURAL_ROAD_STYLE.carriageway.widthMeters / 2,
    sampleCount: probes.length,
    worstPoint,
  }
}

function createRoadJoinInfluences(
  roads: readonly NaturalRoadPlanRoadSegment[],
  widthForRoad: (road: NaturalRoadPlanRoadSegment) => number,
) {
  const joins = new Map<
    string,
    { directions: { angle: number; halfWidth: number }[]; point: NaturalRoadPlanPoint }
  >()
  const addDirection = (
    key: string,
    point: NaturalRoadPlanPoint,
    adjacent: NaturalRoadPlanPoint,
    halfWidth: number,
  ) => {
    const dx = adjacent.x - point.x
    const dz = adjacent.z - point.z
    if (Math.hypot(dx, dz) <= 0.0001) return
    const join = joins.get(key) ?? { directions: [], point }
    join.directions.push({ angle: Math.atan2(dz, dx), halfWidth })
    joins.set(key, join)
  }

  for (const road of roads) {
    const halfWidth = widthForRoad(road) / 2
    const first = road.points[0]
    const second = road.points[1]
    const last = road.points.at(-1)
    const penultimate = road.points.at(-2)
    if (first && second) addDirection(`node:${road.fromNodeId}`, first, second, halfWidth)
    if (last && penultimate) addDirection(`node:${road.toNodeId}`, last, penultimate, halfWidth)
    for (let index = 1; index < road.points.length - 1; index += 1) {
      const previous = road.points[index - 1]
      const point = road.points[index]
      const next = road.points[index + 1]
      if (!(previous && point && next)) continue
      const key = `road:${road.id}:${index}`
      addDirection(key, point, previous, halfWidth)
      addDirection(key, point, next, halfWidth)
    }
  }

  return [...joins.values()].map((join) => {
    const directions = [...join.directions].sort((first, second) => first.angle - second.angle)
    let radiusMeters =
      NATURAL_ROAD_STYLE.carriageway.widthMeters / 2 +
      NATURAL_ROAD_STYLE.carriageway.intersectionCornerRadiusMeters +
      NATURAL_ROAD_WIDTH_AUDIT_SAMPLE_SPACING_METERS
    for (let index = 0; index < directions.length; index += 1) {
      const current = directions[index]
      const next = directions[(index + 1) % directions.length]
      if (!(current && next)) continue
      const gap = (((next.angle - current.angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      if (gap <= 0.01 || gap >= Math.PI - 0.01) continue
      const tangentDistance =
        (Math.max(current.halfWidth, next.halfWidth) +
          NATURAL_ROAD_STYLE.carriageway.intersectionCornerRadiusMeters) /
        Math.tan(gap / 2)
      radiusMeters = Math.max(
        radiusMeters,
        tangentDistance + NATURAL_ROAD_WIDTH_AUDIT_SAMPLE_SPACING_METERS,
      )
    }
    return { point: join.point, radiusMeters: Math.min(radiusMeters, 12) }
  })
}

function rayToFootprintBoundaryDistance(
  point: NaturalRoadPlanPoint,
  direction: NaturalRoadPlanPoint,
  area: MultiPolygon,
) {
  let minimumDistance = Number.POSITIVE_INFINITY
  for (const polygon of area) {
    for (const ring of polygon) {
      const opened = openRing(ring)
      for (let index = 0; index < opened.length; index += 1) {
        const start = opened[index]
        const end = opened[(index + 1) % opened.length]
        if (!(start && end)) continue
        const edgeX = end[0] - start[0]
        const edgeZ = end[1] - start[1]
        const toEdgeX = start[0] - point.x
        const toEdgeZ = start[1] - point.z
        const denominator = direction.x * edgeZ - direction.z * edgeX
        if (Math.abs(denominator) <= 0.0000001) continue
        const rayDistance = (toEdgeX * edgeZ - toEdgeZ * edgeX) / denominator
        const edgeProgress = (toEdgeX * direction.z - toEdgeZ * direction.x) / denominator
        if (rayDistance > 0.000001 && edgeProgress >= -0.000001 && edgeProgress <= 1.000001) {
          minimumDistance = Math.min(minimumDistance, rayDistance)
        }
      }
    }
  }
  return minimumDistance
}

function auditFootprintOffset(
  subject: MultiPolygon,
  source: MultiPolygon,
  expectedMeters: number,
  perimeter: readonly NaturalRoadPlanPoint[],
  perimeterExclusionMeters: number,
) {
  const sourceSegments = source.flatMap((polygon) =>
    polygon.flatMap((ring) => {
      const opened = openRing(ring)
      return opened.flatMap((start, index) => {
        const end = opened[(index + 1) % opened.length]
        return end
          ? [
              [
                { x: start[0], z: start[1] },
                { x: end[0], z: end[1] },
              ] as const,
            ]
          : []
      })
    }),
  )
  let maximumMeters = 0
  let minimumMeters = Number.POSITIVE_INFINITY
  let maximumAbsoluteErrorMeters = 0
  let point = { x: 0, z: 0 }

  for (const polygon of subject) {
    for (const ring of polygon) {
      for (const [x, z] of openRing(ring)) {
        const candidate = { x, z }
        if (pointToPerimeterDistance(candidate, perimeter) <= perimeterExclusionMeters) continue
        let distance = Number.POSITIVE_INFINITY
        for (const [start, end] of sourceSegments) {
          distance = Math.min(distance, pointToSegmentDistance(candidate, start, end))
        }
        if (!Number.isFinite(distance)) continue
        maximumMeters = Math.max(maximumMeters, distance)
        minimumMeters = Math.min(minimumMeters, distance)
        const absoluteError = Math.abs(distance - expectedMeters)
        if (absoluteError <= maximumAbsoluteErrorMeters) continue
        maximumAbsoluteErrorMeters = absoluteError
        point = candidate
      }
    }
  }

  return {
    excessMeters: Math.max(0, maximumMeters - expectedMeters),
    expectedMeters,
    maximumAbsoluteErrorMeters,
    maximumMeters,
    minimumMeters: Number.isFinite(minimumMeters) ? minimumMeters : expectedMeters,
    point,
  }
}

function cleanRoadPoints(points: readonly NaturalRoadPlanPoint[]) {
  const cleaned: NaturalRoadPlanPoint[] = []
  for (const point of points) {
    if (!(Number.isFinite(point.x) && Number.isFinite(point.z))) continue
    const previous = cleaned.at(-1)
    if (previous && Math.hypot(point.x - previous.x, point.z - previous.z) <= 0.0001) continue
    cleaned.push({ x: snap(point.x), z: snap(point.z) })
  }
  return cleaned
}

function closedRoadPoints(points: readonly NaturalRoadPlanPoint[]) {
  const cleaned = cleanRoadPoints(points)
  const first = cleaned[0]
  const last = cleaned.at(-1)
  if (!(first && last)) return cleaned
  if (Math.hypot(first.x - last.x, first.z - last.z) <= 0.0001) return cleaned
  return [...cleaned, { x: first.x, z: first.z }]
}

function cleanMultiPolygon(area: MultiPolygon): MultiPolygon {
  return area.flatMap((polygon) => {
    const outer = cleanRing(polygon[0] ?? [])
    if (outer.length < 4 || Math.abs(ringArea(outer)) < NATURAL_ROAD_MIN_POLYGON_AREA) return []
    const holes = polygon
      .slice(1)
      .map(cleanRing)
      .filter(
        (ring) => ring.length >= 4 && Math.abs(ringArea(ring)) >= NATURAL_ROAD_MIN_POLYGON_AREA,
      )
    return [[outer, ...holes]]
  })
}

function cleanRing(ring: Ring): Ring {
  const deduplicated: Ring = []
  for (const [x, z] of openRing(ring)) {
    if (!(Number.isFinite(x) && Number.isFinite(z))) continue
    const point = snappedPair(x, z)
    const previous = deduplicated.at(-1)
    if (previous && previous[0] === point[0] && previous[1] === point[1]) continue
    deduplicated.push(point)
  }
  const first = deduplicated[0]
  const last = deduplicated.at(-1)
  if (first && last && first[0] === last[0] && first[1] === last[1]) deduplicated.pop()
  if (deduplicated.length < 3) return []

  const simplified: Ring = []
  for (const point of deduplicated) {
    simplified.push(point)
    while (simplified.length >= 3) {
      const next = simplified.at(-1)
      const current = simplified.at(-2)
      const previous = simplified.at(-3)
      if (!(previous && current && next && redundantOnSnapGrid(previous, current, next))) break
      simplified.splice(-2, 1)
    }
  }
  while (
    simplified.length >= 3 &&
    redundantOnSnapGrid(simplified.at(-1)!, simplified[0]!, simplified[1]!)
  ) {
    simplified.shift()
  }
  while (
    simplified.length >= 3 &&
    redundantOnSnapGrid(simplified.at(-2)!, simplified.at(-1)!, simplified[0]!)
  ) {
    simplified.pop()
  }
  return simplified.length >= 3 ? closedRing(simplified) : []
}

function redundantOnSnapGrid(previous: Pair, current: Pair, next: Pair) {
  const previousX = Math.round(previous[0] * NATURAL_ROAD_SNAP_SCALE)
  const previousZ = Math.round(previous[1] * NATURAL_ROAD_SNAP_SCALE)
  const currentX = Math.round(current[0] * NATURAL_ROAD_SNAP_SCALE)
  const currentZ = Math.round(current[1] * NATURAL_ROAD_SNAP_SCALE)
  const nextX = Math.round(next[0] * NATURAL_ROAD_SNAP_SCALE)
  const nextZ = Math.round(next[1] * NATURAL_ROAD_SNAP_SCALE)
  const collinear =
    (currentX - previousX) * (nextZ - currentZ) === (currentZ - previousZ) * (nextX - currentX)
  const between =
    (currentX - previousX) * (currentX - nextX) + (currentZ - previousZ) * (currentZ - nextZ) <= 0
  return collinear && between
}

function footprintBounds(area: MultiPolygon) {
  let maxX = -Infinity
  let maxZ = -Infinity
  let minX = Infinity
  let minZ = Infinity
  for (const polygon of area) {
    for (const ring of polygon) {
      for (const [x, z] of ring) {
        maxX = Math.max(maxX, x)
        maxZ = Math.max(maxZ, z)
        minX = Math.min(minX, x)
        minZ = Math.min(minZ, z)
      }
    }
  }
  return Number.isFinite(minX) ? { maxX, maxZ, minX, minZ } : null
}

function openRing(ring: Ring): Ring {
  if (ring.length <= 1) return [...ring]
  const first = ring[0]
  const last = ring.at(-1)
  if (first && last && first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1)
  return [...ring]
}

function closedRing(ring: Ring): Ring {
  if (ring.length === 0) return []
  const opened = openRing(ring)
  const first = opened[0]
  return first ? [...opened, [first[0], first[1]]] : []
}

function pointPair(point: NaturalRoadPlanPoint): Pair {
  return snappedPair(point.x, point.z)
}

function snappedPair(x: number, z: number): Pair {
  return [snap(x), snap(z)]
}

function snap(value: number) {
  return Math.round(value * NATURAL_ROAD_SNAP_SCALE) / NATURAL_ROAD_SNAP_SCALE
}

function ringArea(ring: Ring) {
  const opened = openRing(ring)
  let area = 0
  for (let index = 0; index < opened.length; index += 1) {
    const current = opened[index]
    const next = opened[(index + 1) % opened.length]
    if (current && next) area += current[0] * next[1] - next[0] * current[1]
  }
  return area * 0.5
}

function segmentSignature(start: NaturalRoadPlanPoint, end: NaturalRoadPlanPoint, radius: number) {
  const startKey = `${snap(start.x)}:${snap(start.z)}`
  const endKey = `${snap(end.x)}:${snap(end.z)}`
  const [first, second] = startKey < endKey ? [startKey, endKey] : [endKey, startKey]
  return `${first}|${second}|${snap(radius)}`
}

function hashUnit(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4_294_967_296
}

function currentTimeMilliseconds() {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}
