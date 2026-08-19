'use client'

import {
  countWorldPolygonSurfaceTriangles,
  createWorldPolygonBoundaryWallsGeometry,
  createWorldPolygonSurfaceGeometry,
} from '@landrush/runtime'
import polygonClipping, {
  type MultiPolygon,
  type Pair,
  type Polygon,
  type Ring,
} from 'polygon-clipping'
import { useEffect, useMemo } from 'react'
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from 'three'
import type { LandrushPoint2, LandrushRoadSegment, LandrushVec3 } from '@/components/landrush/types'
import {
  STYLIZED_PATH_OUTER_CURB_COLOR,
  STYLIZED_PATH_SIDEWALK_COLOR,
} from './stylized-path-network-layer'

export type NaturalRoadDebugMode = 'clearance' | 'final' | 'structure' | 'topology'
export type NaturalRoadQuality = 'balanced' | 'high'
export type NaturalRoadSeed = 'cala' | 'capri' | 'corsica'
export type NaturalRoadSidewalkStyle = 'multiplayer-island' | 'natural'

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
  position: LandrushPoint2
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
  }
  nodes: readonly NaturalRoadNode[]
  perimeterSidewalkPoints: readonly LandrushPoint2[]
  perimeterSidewalkRoadIds: readonly string[]
  quality: NaturalRoadQuality
  roadWidths: Readonly<Record<string, number>>
  roads: readonly LandrushRoadSegment[]
  seed: NaturalRoadSeed
}

type NaturalRoadGeometryBundle = {
  asphalt: BufferGeometry
  centerDashes: BufferGeometry
  clearance: BufferGeometry
  curbWalls: BufferGeometry
  edgeLines: BufferGeometry
  perimeterTopology: BufferGeometry
  sidewalks: BufferGeometry
  topology: BufferGeometry
}

export const NATURAL_ROAD_FINAL_DRAW_GROUPS = 5
export const NATURAL_ROAD_FRAME_BUDGET_MS = 3

export const NATURAL_ROAD_STYLE = {
  carriageway: {
    liftMeters: 0.045,
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
    curbHeightMeters: 0.085,
    grassClearanceMeters: 0.08,
    perimeterThicknessMeters: 1.55,
    widthMeters: 0.5,
  },
} as const

export const NATURAL_ROAD_VISUAL_CONTRACT = {
  subject: 'A natural animated-style Mediterranean road network following the parcel path graph',
  identity: [
    'soft gray asphalt following the original path centerlines',
    'ordinary low warm-stone sidewalks instead of retaining or race walls',
    'a full-width warm-stone promenade around the closed island perimeter',
    'unbroken open mouths at T and four-way intersections',
    'restrained ivory edge lines and dashed centers',
  ],
  invariants: [
    'road node IDs and centerline coordinates match the original parcel-path graph',
    'asphalt is one boolean-unioned footprint, so junctions have a single surface owner',
    'connecting-road sidewalks stop at the promenade inner edge instead of widening its profile',
    'island-perimeter spans contain sidewalk only, with no asphalt or road paint',
    'the perimeter sidewalk extends a constant 1.55 meters inward from the island edge',
    'road-graph classification cannot clip or taper the closed perimeter profile',
    'center markings stop before intersections',
    'final rendering stays at five compiled road draw groups',
  ],
  frameBudgetMs: NATURAL_ROAD_FRAME_BUDGET_MS,
} as const

const NATURAL_ROAD_BOOLEAN_BATCH_SIZE = 256
const NATURAL_ROAD_MIN_POLYGON_AREA = 0.0001
const NATURAL_ROAD_MIN_WIDTH_METERS = 0.08
const NATURAL_ROAD_PERIMETER_MATCH_TOLERANCE_METERS = 0.45
const NATURAL_ROAD_SNAP_SCALE = 10_000

const NATURAL_ROAD_PALETTES: Record<
  NaturalRoadSeed,
  { asphalt: string; curb: string; paint: string; promenade: string; sidewalk: string }
> = {
  cala: {
    asphalt: '#6b706e',
    curb: '#9f8c70',
    paint: '#ece5d2',
    promenade: '#d8c7aa',
    sidewalk: '#c5ab87',
  },
  capri: {
    asphalt: '#656b6b',
    curb: '#9b886d',
    paint: '#eee6d0',
    promenade: '#d3c1a2',
    sidewalk: '#c1a682',
  },
  corsica: {
    asphalt: '#70716d',
    curb: '#a18d71',
    paint: '#e9e2d1',
    promenade: '#dac9ac',
    sidewalk: '#c8ae8b',
  },
}

export function createNaturalRoadPlan({
  elevation,
  perimeter,
  quality,
  roads,
  seed,
}: {
  elevation: number
  perimeter: readonly LandrushPoint2[]
  quality: NaturalRoadQuality
  roads: readonly LandrushRoadSegment[]
  seed: NaturalRoadSeed
}): NaturalRoadPlan {
  const buildStartedAt = currentTimeMilliseconds()
  const roundSegments = quality === 'high' ? 12 : 8
  const cleanedRoads = roads
    .map<LandrushRoadSegment>((road) => ({
      ...road,
      points: cleanRoadPoints(road.points),
    }))
    .filter((road) => road.points.length >= 2)
  const roadWidths = Object.fromEntries(
    cleanedRoads.map((road) => [road.id, NATURAL_ROAD_STYLE.carriageway.widthMeters]),
  )
  const widthForRoad = (road: LandrushRoadSegment) =>
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
    footprintRoads: readonly LandrushRoadSegment[],
    width: (road: LandrushRoadSegment) => number,
  ) => clipFootprint(bufferedRoadFootprint(footprintRoads, width, roundSegments), islandPolygon)

  const perimeterSidewalk = inwardPerimeterBand({
    islandPolygon,
    perimeter: perimeterSidewalkPoints,
    roundSegments,
    thickness: NATURAL_ROAD_STYLE.sidewalk.perimeterThicknessMeters,
  })
  const asphaltSource = clippedFootprint(interiorRoads, widthForRoad)
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
  const metrics = finalGeometryMetrics(footprints)

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
    },
    nodes,
    perimeterSidewalkPoints,
    perimeterSidewalkRoadIds: [...perimeterSidewalkRoadIds].sort(),
    quality,
    roadWidths,
    roads: cleanedRoads,
    seed,
  }
}

export function createNaturalRoadMaskSegments(
  plan: NaturalRoadPlan,
  widthScale = 1,
): readonly LandrushRoadSegment[] {
  const y = asphaltY(plan)
  const scale = Math.max(0.01, widthScale)
  const perimeterSidewalkRoadIds = new Set(plan.perimeterSidewalkRoadIds)
  const maskRoads = plan.roads
    .filter((road) => !perimeterSidewalkRoadIds.has(road.id))
    .map((road) => ({
      ...road,
      points: [...road.points],
      r3fPoints: road.points.map((point) => [point.x, y, point.z] satisfies LandrushVec3),
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
        (point) => [point.x, y, point.z] satisfies LandrushVec3,
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

export function NaturalRoadNetworkLayer({
  debugMode,
  plan,
  renderOrder = 30,
  sidewalkStyle = 'natural',
  visible = true,
}: {
  debugMode: NaturalRoadDebugMode
  plan: NaturalRoadPlan
  renderOrder?: number
  sidewalkStyle?: NaturalRoadSidewalkStyle
  visible?: boolean
}) {
  const geometries = useMemo(
    () => createNaturalRoadGeometryBundle(plan, sidewalkStyle),
    [plan, sidewalkStyle],
  )
  const palette = NATURAL_ROAD_PALETTES[plan.seed]
  const multiplayerSidewalkStyle = sidewalkStyle === 'multiplayer-island'

  useEffect(
    () => () => {
      for (const geometry of Object.values(geometries)) geometry.dispose()
    },
    [geometries],
  )

  if (debugMode === 'clearance') {
    return (
      <group name="natural-road-clearance-debug" visible={visible}>
        <mesh geometry={geometries.clearance} renderOrder={renderOrder}>
          <meshBasicMaterial
            color="#22d3ee"
            depthWrite={false}
            opacity={0.42}
            side={DoubleSide}
            toneMapped={false}
            transparent
          />
        </mesh>
        <lineSegments geometry={geometries.topology} renderOrder={renderOrder + 1}>
          <lineBasicMaterial color="#ecfeff" depthTest={false} toneMapped={false} />
        </lineSegments>
        <lineSegments geometry={geometries.perimeterTopology} renderOrder={renderOrder + 2}>
          <lineBasicMaterial color="#fbbf24" depthTest={false} toneMapped={false} />
        </lineSegments>
      </group>
    )
  }

  if (debugMode === 'structure') {
    return (
      <group name="natural-road-structure-debug" visible={visible}>
        <mesh geometry={geometries.curbWalls} renderOrder={renderOrder}>
          <meshBasicMaterial color="#f59e0b" side={DoubleSide} toneMapped={false} wireframe />
        </mesh>
        <mesh geometry={geometries.sidewalks} renderOrder={renderOrder + 1}>
          <meshBasicMaterial color="#fbbf24" side={DoubleSide} toneMapped={false} wireframe />
        </mesh>
        <mesh geometry={geometries.asphalt} renderOrder={renderOrder + 2}>
          <meshBasicMaterial color="#f8fafc" side={DoubleSide} toneMapped={false} wireframe />
        </mesh>
        <lineSegments geometry={geometries.topology} renderOrder={renderOrder + 3}>
          <lineBasicMaterial color="#38bdf8" depthTest={false} toneMapped={false} />
        </lineSegments>
        <lineSegments geometry={geometries.perimeterTopology} renderOrder={renderOrder + 4}>
          <lineBasicMaterial color="#fbbf24" depthTest={false} toneMapped={false} />
        </lineSegments>
      </group>
    )
  }

  if (debugMode === 'topology') {
    return (
      <group name="natural-road-topology-debug" visible={visible}>
        <mesh geometry={geometries.asphalt} renderOrder={renderOrder}>
          <meshBasicMaterial
            color="#64748b"
            depthWrite={false}
            opacity={0.34}
            side={DoubleSide}
            toneMapped={false}
            transparent
          />
        </mesh>
        <lineSegments geometry={geometries.topology} renderOrder={renderOrder + 1}>
          <lineBasicMaterial color="#f8fafc" depthTest={false} toneMapped={false} />
        </lineSegments>
        <lineSegments geometry={geometries.perimeterTopology} renderOrder={renderOrder + 2}>
          <lineBasicMaterial color="#fbbf24" depthTest={false} toneMapped={false} />
        </lineSegments>
        {plan.nodes
          .filter((node) => node.degree !== 2)
          .map((node) => (
            <mesh
              key={node.id}
              position={[node.position.x, asphaltY(plan) + 0.18, node.position.z]}
              renderOrder={renderOrder + 3}
            >
              <sphereGeometry args={[node.degree >= 3 ? 0.3 : 0.19, 10, 6]} />
              <meshBasicMaterial
                color={node.degree >= 3 ? '#fb7185' : '#a3e635'}
                depthTest={false}
                toneMapped={false}
              />
            </mesh>
          ))}
      </group>
    )
  }

  return (
    <group name="natural-road-network" visible={visible}>
      <mesh
        geometry={geometries.curbWalls}
        name="natural-road-curb-walls"
        renderOrder={renderOrder}
      >
        {multiplayerSidewalkStyle ? (
          <meshBasicMaterial
            color={STYLIZED_PATH_OUTER_CURB_COLOR}
            side={DoubleSide}
            toneMapped={false}
          />
        ) : (
          <meshStandardMaterial
            color={palette.curb}
            metalness={0}
            roughness={0.96}
            side={DoubleSide}
          />
        )}
      </mesh>
      <mesh
        geometry={geometries.sidewalks}
        name="natural-road-sidewalks"
        renderOrder={renderOrder + 1}
      >
        {multiplayerSidewalkStyle ? (
          <meshBasicMaterial color="#ffffff" side={DoubleSide} toneMapped={false} vertexColors />
        ) : (
          <meshStandardMaterial
            color="#ffffff"
            metalness={0}
            roughness={0.93}
            side={DoubleSide}
            vertexColors
          />
        )}
      </mesh>
      <mesh geometry={geometries.asphalt} name="natural-road-asphalt" renderOrder={renderOrder + 2}>
        <meshStandardMaterial
          color={palette.asphalt}
          metalness={0}
          roughness={0.94}
          side={DoubleSide}
        />
      </mesh>
      <mesh
        geometry={geometries.edgeLines}
        name="natural-road-edge-lines"
        renderOrder={renderOrder + 3}
      >
        <meshStandardMaterial
          color={palette.paint}
          metalness={0}
          roughness={0.96}
          side={DoubleSide}
        />
      </mesh>
      <mesh
        geometry={geometries.centerDashes}
        name="natural-road-center-dashes"
        renderOrder={renderOrder + 4}
      >
        <meshStandardMaterial
          color={palette.paint}
          metalness={0}
          roughness={0.96}
          side={DoubleSide}
        />
      </mesh>
    </group>
  )
}

function createNaturalRoadGeometryBundle(
  plan: NaturalRoadPlan,
  sidewalkStyle: NaturalRoadSidewalkStyle,
): NaturalRoadGeometryBundle {
  const asphaltSurfaceY = asphaltY(plan)
  const sidewalkSurfaceY = sidewalkY(plan)
  const paintY = asphaltSurfaceY + 0.012
  const palette = NATURAL_ROAD_PALETTES[plan.seed]
  const sidewalkColor =
    sidewalkStyle === 'multiplayer-island' ? STYLIZED_PATH_SIDEWALK_COLOR : palette.sidewalk
  const promenadeColor =
    sidewalkStyle === 'multiplayer-island' ? STYLIZED_PATH_SIDEWALK_COLOR : palette.promenade
  const perimeterSidewalkRoadIds = new Set(plan.perimeterSidewalkRoadIds)
  return {
    asphalt: surfaceGeometry(plan.footprints.asphalt, asphaltSurfaceY, 'asphalt'),
    centerDashes: surfaceGeometry(plan.footprints.centerDashes, paintY, 'center-dashes'),
    clearance: surfaceGeometry(
      plan.footprints.clearance,
      plan.groundElevation + 0.025,
      'clearance',
    ),
    curbWalls: boundaryWallsGeometry(
      [
        {
          area: plan.footprints.outerSidewalk,
          bottomY: plan.groundElevation + 0.018,
          topY: sidewalkSurfaceY,
        },
        { area: plan.footprints.asphalt, bottomY: asphaltSurfaceY, topY: sidewalkSurfaceY },
      ],
      'curb-walls',
    ),
    edgeLines: surfaceGeometry(plan.footprints.edgeLines, paintY, 'edge-lines'),
    perimeterTopology: topologyGeometry(
      plan,
      plan.roads.filter((road) => perimeterSidewalkRoadIds.has(road.id)),
      'perimeter-topology',
    ),
    sidewalks: layeredSurfaceGeometry(
      [
        { area: plan.footprints.roadSidewalks, color: sidewalkColor },
        { area: plan.footprints.perimeterSidewalk, color: promenadeColor },
      ],
      sidewalkSurfaceY,
      'sidewalks',
    ),
    topology: topologyGeometry(plan, plan.roads, 'topology'),
  }
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
  roads: readonly LandrushRoadSegment[]
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

function createNaturalRoadNodes(roads: readonly LandrushRoadSegment[]) {
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
  position: LandrushPoint2,
) {
  const current = nodes.get(id)
  if (current) {
    current.degree += 1
    return
  }
  nodes.set(id, { degree: 1, id, position: { x: position.x, z: position.z } })
}

function bufferedRoadFootprint(
  roads: readonly LandrushRoadSegment[],
  widthForRoad: (road: LandrushRoadSegment) => number,
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
  perimeter: readonly LandrushPoint2[]
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
  points: readonly LandrushPoint2[],
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

function unionPolygons(shapes: readonly Polygon[]) {
  let result: MultiPolygon = []
  for (let offset = 0; offset < shapes.length; offset += NATURAL_ROAD_BOOLEAN_BATCH_SIZE) {
    const batch = shapes.slice(offset, offset + NATURAL_ROAD_BOOLEAN_BATCH_SIZE)
    const first = batch[0]
    if (!first) continue
    const batchUnion = polygonClipping.union(first, ...batch.slice(1))
    result = result.length === 0 ? batchUnion : polygonClipping.union(result, batchUnion)
  }
  return cleanMultiPolygon(result)
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

function perimeterPolygon(perimeter: readonly LandrushPoint2[]): Polygon {
  const ring = closedRing(cleanRoadPoints(perimeter).map(pointPair))
  return ring.length >= 4 ? [ring] : []
}

function circlePolygon(point: LandrushPoint2, radius: number, roundSegments: number): Polygon {
  const ring: Ring = []
  const segmentCount = Math.max(6, roundSegments)
  for (let index = 0; index < segmentCount; index += 1) {
    const angle = (index / segmentCount) * Math.PI * 2
    ring.push(snappedPair(point.x + Math.cos(angle) * radius, point.z + Math.sin(angle) * radius))
  }
  return [closedRing(ring)]
}

function segmentCapsule(
  start: LandrushPoint2,
  end: LandrushPoint2,
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

function surfaceGeometry(area: MultiPolygon, y: number, role: string) {
  return layeredSurfaceGeometry([{ area }], y, role)
}

function layeredSurfaceGeometry(
  layers: readonly { area: MultiPolygon; color?: string }[],
  y: number,
  role: string,
) {
  return createWorldPolygonSurfaceGeometry(layers, y, {
    key: 'naturalRoadRole',
    value: role,
  })
}

function boundaryWallsGeometry(
  bands: readonly { area: MultiPolygon; bottomY: number; topY: number }[],
  role: string,
) {
  return createWorldPolygonBoundaryWallsGeometry(bands, {
    key: 'naturalRoadRole',
    value: role,
  })
}

function topologyGeometry(
  plan: NaturalRoadPlan,
  roads: readonly LandrushRoadSegment[],
  role: string,
) {
  const geometry = new BufferGeometry()
  const positions: number[] = []
  const y = asphaltY(plan) + 0.1
  for (const road of roads) {
    for (let index = 0; index < road.points.length - 1; index += 1) {
      const start = road.points[index]
      const end = road.points[index + 1]
      if (!(start && end)) continue
      positions.push(start.x, y, start.z, end.x, y, end.z)
    }
  }
  geometry.userData.naturalRoadRole = role
  if (positions.length > 0) {
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
  }
  return geometry
}

function finalGeometryMetrics(footprints: NaturalRoadFootprints) {
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
  const wallEdges =
    footprintVertexCount(footprints.outerSidewalk) + footprintVertexCount(footprints.asphalt)
  return {
    triangles:
      surfaceAreas.reduce((total, footprint) => total + surfaceTriangleCount(footprint), 0) +
      wallEdges * 2,
    vertices: surfaceVertices + wallEdges * 4,
  }
}

function surfaceTriangleCount(area: MultiPolygon) {
  return countWorldPolygonSurfaceTriangles(area)
}

function footprintVertexCount(area: MultiPolygon) {
  return area.reduce(
    (total, polygon) =>
      total + polygon.reduce((polygonTotal, ring) => polygonTotal + openRing(ring).length, 0),
    0,
  )
}

function asphaltY(plan: NaturalRoadPlan) {
  return plan.groundElevation + NATURAL_ROAD_STYLE.carriageway.liftMeters
}

function sidewalkY(plan: NaturalRoadPlan) {
  return asphaltY(plan) + NATURAL_ROAD_STYLE.sidewalk.curbHeightMeters
}

function polylineLength(points: readonly LandrushPoint2[]) {
  let length = 0
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    if (start && end) length += Math.hypot(end.x - start.x, end.z - start.z)
  }
  return length
}

function isIslandPerimeterRoad(road: LandrushRoadSegment, perimeter: readonly LandrushPoint2[]) {
  if (road.connectsParcelIds.length !== 1 || road.points.length < 2) return false
  return road.points.every(
    (point) =>
      pointToPerimeterDistance(point, perimeter) <= NATURAL_ROAD_PERIMETER_MATCH_TOLERANCE_METERS,
  )
}

function pointToPerimeterDistance(point: LandrushPoint2, perimeter: readonly LandrushPoint2[]) {
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

function pointToSegmentDistance(point: LandrushPoint2, start: LandrushPoint2, end: LandrushPoint2) {
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

function cleanRoadPoints(points: readonly LandrushPoint2[]) {
  const cleaned: LandrushPoint2[] = []
  for (const point of points) {
    if (!(Number.isFinite(point.x) && Number.isFinite(point.z))) continue
    const previous = cleaned.at(-1)
    if (previous && Math.hypot(point.x - previous.x, point.z - previous.z) <= 0.0001) continue
    cleaned.push({ x: snap(point.x), z: snap(point.z) })
  }
  return cleaned
}

function closedRoadPoints(points: readonly LandrushPoint2[]) {
  const cleaned = cleanRoadPoints(points)
  const first = cleaned[0]
  const last = cleaned.at(-1)
  if (!(first && last)) return cleaned
  if (Math.hypot(first.x - last.x, first.z - last.z) <= 0.0001) return cleaned
  return [...cleaned, { x: first.x, z: first.z }]
}

function cleanMultiPolygon(area: MultiPolygon): MultiPolygon {
  return area
    .map((polygon) =>
      polygon
        .map((ring) => closedRing(openRing(ring).map(([x, z]) => snappedPair(x, z))))
        .filter((ring) => ring.length >= 4),
    )
    .filter((polygon) => {
      const outer = polygon[0]
      return outer ? Math.abs(ringArea(outer)) >= NATURAL_ROAD_MIN_POLYGON_AREA : false
    })
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

function pointPair(point: LandrushPoint2): Pair {
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

function segmentSignature(start: LandrushPoint2, end: LandrushPoint2, radius: number) {
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
