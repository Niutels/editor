import type { LandrushPoint2 } from '@/components/landrush/types'
import { type ParcelAllocationResult, polygonCentroid } from './parcel-allocation'

export type ParcelStreetOptions = {
  roadWidthMeters: number
  loopiness: number
  seed: string | number
}

export type ParcelStreetSegment = {
  id: string
  length: number
  parcelIds: readonly string[]
  points: readonly LandrushPoint2[]
  width: number
}

export type ParcelStreetNetwork = {
  connectedParcelCount: number
  connectedParcelIds: readonly string[]
  graphConnected: boolean
  roadConnected: boolean
  segments: readonly ParcelStreetSegment[]
  totalLength: number
}

type RoadGraph = {
  adjacency: Map<string, readonly RoadGraphEdge[]>
  edges: readonly RoadGraphEdge[]
  nodes: Map<string, LandrushPoint2>
}

type RoadGraphEdge = {
  alignment: number
  centrality: number
  endNodeId: string
  id: string
  length: number
  parcelIds: readonly string[]
  points: readonly [LandrushPoint2, LandrushPoint2]
  startNodeId: string
}

type RawParcelEdge = {
  end: LandrushPoint2
  parcelId: string
  start: LandrushPoint2
}

type DijkstraState = {
  distances: Map<string, number>
  previous: Map<string, { edge: RoadGraphEdge; nodeId: string }>
}

type RandomSource = () => number

export const DEFAULT_PARCEL_STREET_WIDTH_METERS = 2.4
export const PARCEL_STREET_CURB_EXTRA_WIDTH_METERS = 0.22
export const PARCEL_STREET_SHOULDER_EXTRA_WIDTH_METERS = 0.9

const EPSILON = 0.000001
const NODE_PRECISION = 100
const MIN_ROAD_EDGE_LENGTH = 0.75
const MIN_SERVICE_EDGE_LENGTH = 4.5
const MIN_SAFE_STREET_LENGTH = 0.5
const STREET_BOUNDARY_CLEARANCE_PADDING = 0.04
const STREET_CENTERLINE_SAMPLE_METERS = 0.35

export function generateParcelStreets(
  allocation: ParcelAllocationResult,
  options: ParcelStreetOptions,
): ParcelStreetNetwork {
  const graph = createRoadGraph(allocation)
  const parcelIds = allocation.parcels.map((parcel) => parcel.id)
  if (parcelIds.length <= 1 || graph.edges.length === 0) {
    return {
      connectedParcelCount: parcelIds.length <= 1 ? parcelIds.length : 0,
      connectedParcelIds: parcelIds.length <= 1 ? parcelIds : [],
      graphConnected: parcelIds.length <= 1,
      roadConnected: true,
      segments: [],
      totalLength: 0,
    }
  }

  const selectedEdges = selectMinimumConnectedEdges(graph, parcelIds, options)
  const roadWidthMeters = normalizedRoadWidth(options.roadWidthMeters)
  const streetEdges = repairSafeStreetEdges(
    graph.edges,
    selectedEdges,
    allocation.boundary,
    roadWidthMeters,
    parcelIds,
  )
  const segments = buildSafeStreetSegments(streetEdges, allocation.boundary, roadWidthMeters)
  const connectedParcelIds = connectedStreetParcelIds(parcelIds, segments)

  return {
    connectedParcelCount: connectedParcelIds.length,
    connectedParcelIds,
    graphConnected: connectedParcelIds.length === parcelIds.length,
    roadConnected: selectedEdgesConnected(streetEdges) && streetSegmentsConnected(segments),
    segments,
    totalLength: segments.reduce((total, segment) => total + segment.length, 0),
  }
}

export function generateParcelEdgeStreets(
  allocation: ParcelAllocationResult,
  options: ParcelStreetOptions,
): ParcelStreetNetwork {
  const parcelIds = allocation.parcels.map((parcel) => parcel.id)
  if (parcelIds.length === 0) {
    return {
      connectedParcelCount: 0,
      connectedParcelIds: [],
      graphConnected: true,
      roadConnected: true,
      segments: [],
      totalLength: 0,
    }
  }

  const roadWidthMeters = normalizedRoadWidth(options.roadWidthMeters)
  const segments = buildParcelEdgeStreetSegments(allocation, roadWidthMeters)
  const connectedParcelIds = coveredStreetParcelIds(parcelIds, segments)

  return {
    connectedParcelCount: connectedParcelIds.length,
    connectedParcelIds,
    graphConnected: connectedParcelIds.length === parcelIds.length,
    roadConnected: streetSegmentsConnected(segments),
    segments,
    totalLength: segments.reduce((total, segment) => total + segment.length, 0),
  }
}

function normalizedRoadWidth(width: number) {
  return Number.isFinite(width) ? Math.max(0.1, width) : DEFAULT_PARCEL_STREET_WIDTH_METERS
}

function streetProfileClearance(roadWidth: number) {
  return (
    (roadWidth +
      PARCEL_STREET_SHOULDER_EXTRA_WIDTH_METERS +
      PARCEL_STREET_CURB_EXTRA_WIDTH_METERS) /
      2 +
    STREET_BOUNDARY_CLEARANCE_PADDING
  )
}

function repairSafeStreetEdges(
  graphEdges: readonly RoadGraphEdge[],
  initialEdges: readonly RoadGraphEdge[],
  boundary: readonly LandrushPoint2[],
  roadWidth: number,
  parcelIds: readonly string[],
) {
  const selectedEdges = [...initialEdges]
  const selectedIds = new Set(selectedEdges.map((edge) => edge.id))
  let segments = buildSafeStreetSegments(selectedEdges, boundary, roadWidth)
  let connectedParcelIds = connectedStreetParcelIds(parcelIds, segments)
  let componentCount = streetSegmentComponentCount(segments)
  let guard = 0

  while ((connectedParcelIds.length < parcelIds.length || componentCount > 1) && guard < 16) {
    const repairEdge = bestSafeRepairEdge(
      graphEdges,
      selectedEdges,
      selectedIds,
      boundary,
      roadWidth,
      parcelIds,
      connectedParcelIds.length,
      componentCount,
    )
    if (!repairEdge) break

    selectedEdges.push(repairEdge)
    selectedIds.add(repairEdge.id)
    segments = buildSafeStreetSegments(selectedEdges, boundary, roadWidth)
    connectedParcelIds = connectedStreetParcelIds(parcelIds, segments)
    componentCount = streetSegmentComponentCount(segments)
    guard += 1
  }

  return selectedEdges
}

function bestSafeRepairEdge(
  graphEdges: readonly RoadGraphEdge[],
  selectedEdges: readonly RoadGraphEdge[],
  selectedIds: ReadonlySet<string>,
  boundary: readonly LandrushPoint2[],
  roadWidth: number,
  parcelIds: readonly string[],
  connectedParcelCount: number,
  componentCount: number,
) {
  for (const edge of graphEdges) {
    if (selectedIds.has(edge.id)) continue
    const trialEdges = [...selectedEdges, edge]
    const trialSegments = buildSafeStreetSegments(trialEdges, boundary, roadWidth)
    const trialConnectedParcelCount = connectedStreetParcelIds(parcelIds, trialSegments).length
    const trialComponentCount = streetSegmentComponentCount(trialSegments)
    const parcelGain = trialConnectedParcelCount - connectedParcelCount
    const componentGain = componentCount - trialComponentCount
    if (parcelGain <= 0 && componentGain <= 0) continue
    return edge
  }

  return null
}

function buildSafeStreetSegments(
  edges: readonly RoadGraphEdge[],
  boundary: readonly LandrushPoint2[],
  roadWidth: number,
) {
  const streetClearance = streetProfileClearance(roadWidth)
  const endpointOverrides = safeEndpointOverrides(edges, boundary, streetClearance)
  const segments: ParcelStreetSegment[] = []

  for (const [edgeIndex, edge] of edges.entries()) {
    const centerlinePoints = edge.points.map(
      (point) => endpointOverrides.get(nodeIdForPoint(point)) ?? point,
    )
    const chains = safeCenterlineChains(centerlinePoints, boundary, streetClearance)

    for (const [chainIndex, chain] of chains.entries()) {
      const length = polylineLength(chain)
      if (length < MIN_SAFE_STREET_LENGTH) continue
      segments.push({
        id:
          chains.length === 1
            ? `street-${String(edgeIndex + 1).padStart(2, '0')}`
            : `street-${String(edgeIndex + 1).padStart(2, '0')}-${chainIndex + 1}`,
        length,
        parcelIds: edge.parcelIds,
        points: chain,
        width: roadWidth,
      })
    }
  }

  return segments
}

function buildParcelEdgeStreetSegments(allocation: ParcelAllocationResult, roadWidth: number) {
  const rawEdges = allocation.parcels.flatMap((parcel) => parcelEdges(parcel.id, parcel.points))
  const nodes = new Map<string, LandrushPoint2>()
  const edgeMap = new Map<
    string,
    { end: LandrushPoint2; parcelIds: Set<string>; start: LandrushPoint2 }
  >()

  for (const rawEdge of rawEdges) {
    const splitPoints = splitPointsForRawEdge(rawEdge, rawEdges)
    for (let index = 0; index < splitPoints.length - 1; index += 1) {
      const start = splitPoints[index]
      const end = splitPoints[index + 1]
      if (!(start && end) || distance2(start, end) < MIN_SAFE_STREET_LENGTH) continue
      addEdgeSpan(nodes, edgeMap, start, end, [rawEdge.parcelId])
    }
  }

  for (const [first, second] of neighborParcelPairs(allocation)) {
    for (const firstEdge of parcelEdges(first.id, first.points)) {
      for (const secondEdge of parcelEdges(second.id, second.points)) {
        const overlap = segmentOverlap(
          firstEdge.start,
          firstEdge.end,
          secondEdge.start,
          secondEdge.end,
        )
        if (!overlap || overlap.length < MIN_SAFE_STREET_LENGTH) continue
        addEdgeSpan(nodes, edgeMap, overlap.start, overlap.end, [first.id, second.id])
      }
    }
  }

  return [...edgeMap.entries()]
    .map<ParcelStreetSegment>(([key, edge], edgeIndex) => {
      const length = distance2(edge.start, edge.end)
      return {
        id: `street-${String(edgeIndex + 1).padStart(2, '0')}-${key.replaceAll(':', '_')}`,
        length,
        parcelIds: [...edge.parcelIds].sort(),
        points: [edge.start, edge.end],
        width: roadWidth,
      }
    })
    .filter((segment) => segment.length >= MIN_SAFE_STREET_LENGTH)
    .sort((first, second) => first.length - second.length || first.id.localeCompare(second.id))
}

function connectedStreetParcelIds(
  parcelIds: readonly string[],
  segments: readonly ParcelStreetSegment[],
) {
  return parcelIds.filter((parcelId) =>
    segments.some((segment) => renderedServiceParcelIds(segment).includes(parcelId)),
  )
}

function coveredStreetParcelIds(
  parcelIds: readonly string[],
  segments: readonly ParcelStreetSegment[],
) {
  return parcelIds.filter((parcelId) =>
    segments.some((segment) => segment.parcelIds.includes(parcelId)),
  )
}

function renderedServiceParcelIds(segment: ParcelStreetSegment) {
  return segment.parcelIds.length > 1 ? segment.parcelIds : []
}

function safeEndpointOverrides(
  edges: readonly RoadGraphEdge[],
  boundary: readonly LandrushPoint2[],
  clearance: number,
) {
  const nodeStats = new Map<
    string,
    { direction: { x: number; z: number }; point: LandrushPoint2; selectedEdgeCount: number }
  >()

  for (const edge of edges) {
    const [first, second] = edge.points
    for (const [point, otherPoint] of [
      [first, second],
      [second, first],
    ] as const) {
      const nodeId = nodeIdForPoint(point)
      const current = nodeStats.get(nodeId) ?? {
        direction: { x: 0, z: 0 },
        point,
        selectedEdgeCount: 0,
      }
      const edgeDirection = normalize2({
        x: otherPoint.x - point.x,
        z: otherPoint.z - point.z,
      })
      current.direction.x += edgeDirection.x
      current.direction.z += edgeDirection.z
      current.selectedEdgeCount += 1
      nodeStats.set(nodeId, current)
    }
  }

  const center = polygonCentroid(boundary)
  const overrides = new Map<string, LandrushPoint2>()

  for (const [nodeId, stat] of nodeStats) {
    if (stat.selectedEdgeCount < 2) continue
    if (centerlinePointIsSafe(stat.point, boundary, clearance)) continue
    const safePoint = safeJunctionPoint(stat.point, stat.direction, center, boundary, clearance)
    if (safePoint) overrides.set(nodeId, safePoint)
  }

  return overrides
}

function safeJunctionPoint(
  point: LandrushPoint2,
  incidentDirection: LandrushPoint2,
  center: LandrushPoint2,
  boundary: readonly LandrushPoint2[],
  clearance: number,
) {
  const centerDirection = normalize2({ x: center.x - point.x, z: center.z - point.z })
  const normalizedIncidentDirection = normalize2(incidentDirection)
  const mixedDirection = normalize2({
    x: centerDirection.x * 0.65 + normalizedIncidentDirection.x * 0.35,
    z: centerDirection.z * 0.65 + normalizedIncidentDirection.z * 0.35,
  })
  const directions = [
    mixedDirection,
    centerDirection,
    normalizedIncidentDirection,
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 },
  ]

  for (const direction of directions) {
    if (Math.hypot(direction.x, direction.z) <= EPSILON) continue
    for (let multiplier = 1; multiplier <= 10; multiplier += 1) {
      const candidate = {
        x: point.x + direction.x * clearance * multiplier,
        z: point.z + direction.z * clearance * multiplier,
      }
      if (!centerlinePointIsSafe(candidate, boundary, clearance)) continue
      return clearanceCrossing(point, candidate, boundary, clearance)
    }
  }

  return null
}

function safeCenterlineChains(
  points: readonly LandrushPoint2[],
  boundary: readonly LandrushPoint2[],
  clearance: number,
) {
  const chains: LandrushPoint2[][] = []
  let currentChain: LandrushPoint2[] = []

  for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
    const start = points[pointIndex]
    const end = points[pointIndex + 1]
    if (!(start && end)) continue

    const length = distance2(start, end)
    if (length <= EPSILON) continue

    const sampleCount = Math.max(1, Math.ceil(length / STREET_CENTERLINE_SAMPLE_METERS))
    let previous = centerlineSample(start, end, 0, boundary, clearance)

    for (let sampleIndex = 1; sampleIndex <= sampleCount; sampleIndex += 1) {
      const current = centerlineSample(start, end, sampleIndex / sampleCount, boundary, clearance)

      if (previous.safe && current.safe) {
        appendChainPoint(currentChain, previous.point)
        appendChainPoint(currentChain, current.point)
      } else if (previous.safe && !current.safe) {
        appendChainPoint(currentChain, previous.point)
        appendChainPoint(
          currentChain,
          clearanceCrossing(current.point, previous.point, boundary, clearance),
        )
        finishChain(chains, currentChain)
        currentChain = []
      } else if (!previous.safe && current.safe) {
        currentChain = [
          clearanceCrossing(previous.point, current.point, boundary, clearance),
          current.point,
        ]
      } else if (unsafeSpanHasSafeMidpoint(previous.point, current.point, boundary, clearance)) {
        const midpoint = midpoint2(previous.point, current.point)
        currentChain = [
          clearanceCrossing(previous.point, midpoint, boundary, clearance),
          midpoint,
          clearanceCrossing(current.point, midpoint, boundary, clearance),
        ]
        finishChain(chains, currentChain)
        currentChain = []
      }

      previous = current
    }
  }

  finishChain(chains, currentChain)
  return chains
}

function centerlineSample(
  start: LandrushPoint2,
  end: LandrushPoint2,
  t: number,
  boundary: readonly LandrushPoint2[],
  clearance: number,
) {
  const point = {
    x: lerp(start.x, end.x, t),
    z: lerp(start.z, end.z, t),
  }
  return { point, safe: centerlinePointIsSafe(point, boundary, clearance) }
}

function centerlinePointIsSafe(
  point: LandrushPoint2,
  boundary: readonly LandrushPoint2[],
  clearance: number,
) {
  return pointInPolygon(point, boundary) && distanceToBoundary(point, boundary) >= clearance
}

function clearanceCrossing(
  unsafePoint: LandrushPoint2,
  safePoint: LandrushPoint2,
  boundary: readonly LandrushPoint2[],
  clearance: number,
) {
  let unsafe = unsafePoint
  let safe = safePoint

  for (let index = 0; index < 12; index += 1) {
    const middle = midpoint2(unsafe, safe)
    if (centerlinePointIsSafe(middle, boundary, clearance)) safe = middle
    else unsafe = middle
  }

  return safe
}

function unsafeSpanHasSafeMidpoint(
  start: LandrushPoint2,
  end: LandrushPoint2,
  boundary: readonly LandrushPoint2[],
  clearance: number,
) {
  return centerlinePointIsSafe(midpoint2(start, end), boundary, clearance)
}

function appendChainPoint(chain: LandrushPoint2[], point: LandrushPoint2) {
  const previous = chain.at(-1)
  if (previous && distance2(previous, point) <= 0.001) return
  chain.push(point)
}

function finishChain(chains: LandrushPoint2[][], chain: readonly LandrushPoint2[]) {
  if (chain.length < 2 || polylineLength(chain) < MIN_SAFE_STREET_LENGTH) return
  chains.push([...chain])
}

function polylineLength(points: readonly LandrushPoint2[]) {
  let length = 0
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    if (start && end) length += distance2(start, end)
  }
  return length
}

function createRoadGraph(allocation: ParcelAllocationResult): RoadGraph {
  const rawEdges = allocation.parcels.flatMap((parcel) => parcelEdges(parcel.id, parcel.rawPoints))
  const center = polygonCentroid(allocation.boundary)
  const axis = principalAxis(allocation.boundary)
  const maxRadius = Math.max(
    ...allocation.boundary.map((point) => Math.hypot(point.x - center.x, point.z - center.z)),
    1,
  )
  const nodes = new Map<string, LandrushPoint2>()
  const edgeMap = new Map<
    string,
    { end: LandrushPoint2; parcelIds: Set<string>; start: LandrushPoint2 }
  >()

  for (const rawEdge of rawEdges) {
    const splitPoints = splitPointsForRawEdge(rawEdge, rawEdges)
    for (let index = 0; index < splitPoints.length - 1; index += 1) {
      const start = splitPoints[index]
      const end = splitPoints[index + 1]
      if (!(start && end)) continue
      const length = distance2(start, end)
      if (length < MIN_ROAD_EDGE_LENGTH) continue

      const startNodeId = nodeIdForPoint(start)
      const endNodeId = nodeIdForPoint(end)
      if (startNodeId === endNodeId) continue

      addEdgeSpan(nodes, edgeMap, start, end, [rawEdge.parcelId])
    }
  }

  for (const [first, second] of neighborParcelPairs(allocation)) {
    for (const firstEdge of parcelEdges(first.id, first.rawPoints)) {
      for (const secondEdge of parcelEdges(second.id, second.rawPoints)) {
        const overlap = segmentOverlap(
          firstEdge.start,
          firstEdge.end,
          secondEdge.start,
          secondEdge.end,
        )
        if (!overlap || overlap.length < MIN_ROAD_EDGE_LENGTH) continue
        addEdgeSpan(nodes, edgeMap, overlap.start, overlap.end, [first.id, second.id])
      }
    }
  }

  const edges = [...edgeMap.entries()].map<RoadGraphEdge>(([key, edge]) => {
    const [startNodeId, endNodeId] = key.split('|') as [string, string]
    const midpoint = { x: (edge.start.x + edge.end.x) / 2, z: (edge.start.z + edge.end.z) / 2 }
    const vector = { x: edge.end.x - edge.start.x, z: edge.end.z - edge.start.z }
    const length = Math.max(Math.hypot(vector.x, vector.z), EPSILON)
    const direction = { x: vector.x / length, z: vector.z / length }

    return {
      alignment: Math.abs(dot(direction, axis)),
      centrality: 1 - clamp01(Math.hypot(midpoint.x - center.x, midpoint.z - center.z) / maxRadius),
      endNodeId,
      id: key,
      length,
      parcelIds: [...edge.parcelIds].sort(),
      points: [edge.start, edge.end],
      startNodeId,
    }
  })
  const adjacency = new Map<string, RoadGraphEdge[]>()

  for (const nodeId of nodes.keys()) {
    adjacency.set(nodeId, [])
  }

  for (const edge of edges) {
    adjacency.get(edge.startNodeId)?.push(edge)
    adjacency.get(edge.endNodeId)?.push(edge)
  }

  return { adjacency, edges: edges.sort(compareRoadEdges), nodes }
}

function selectMinimumConnectedEdges(
  graph: RoadGraph,
  parcelIds: readonly string[],
  options: ParcelStreetOptions,
) {
  const selected = new Map<string, RoadGraphEdge>()
  const selectedNodeIds = new Set<string>()
  const servedParcelIds = new Set<string>()
  const startEdge = bestStartEdge(graph.edges)

  if (!startEdge) return []

  addSelectedEdge(startEdge, selected, selectedNodeIds, servedParcelIds)

  while (servedParcelIds.size < parcelIds.length) {
    const connection = shortestConnectionToUnservedParcel(
      graph,
      selectedNodeIds,
      selected,
      servedParcelIds,
    )
    if (!connection) break

    for (const edge of connection.pathEdges) {
      addSelectedEdge(edge, selected, selectedNodeIds, servedParcelIds)
    }
    addSelectedEdge(connection.targetEdge, selected, selectedNodeIds, servedParcelIds)
  }

  const random = createRandom(String(options.seed))
  const extraCount = Math.round(Math.max(0, parcelIds.length - 1) * clamp01(options.loopiness))
  if (extraCount > 0) {
    const extraEdges = graph.edges
      .filter((edge) => !selected.has(edge.id))
      .filter(
        (edge) => selectedNodeIds.has(edge.startNodeId) || selectedNodeIds.has(edge.endNodeId),
      )
      .sort((a, b) => a.length - b.length || random() - 0.5)

    for (const edge of extraEdges.slice(0, extraCount)) {
      addSelectedEdge(edge, selected, selectedNodeIds, servedParcelIds)
    }
  }

  return [...selected.values()].sort(compareRoadEdges)
}

function shortestConnectionToUnservedParcel(
  graph: RoadGraph,
  selectedNodeIds: ReadonlySet<string>,
  selected: ReadonlyMap<string, RoadGraphEdge>,
  servedParcelIds: ReadonlySet<string>,
) {
  const dijkstra = multiSourceDijkstra(graph, selectedNodeIds)
  let best: {
    cost: number
    pathEdges: readonly RoadGraphEdge[]
    targetEdge: RoadGraphEdge
    targetNodeId: string
  } | null = null

  for (const edge of graph.edges) {
    if (selected.has(edge.id)) continue
    const servedByEdge = serviceParcelIds(edge)
    if (servedByEdge.length === 0) continue
    if (servedByEdge.every((parcelId) => servedParcelIds.has(parcelId))) continue

    const startDistance = dijkstra.distances.get(edge.startNodeId) ?? Number.POSITIVE_INFINITY
    const endDistance = dijkstra.distances.get(edge.endNodeId) ?? Number.POSITIVE_INFINITY
    const targetNodeId = startDistance <= endDistance ? edge.startNodeId : edge.endNodeId
    const distance = Math.min(startDistance, endDistance)
    if (!Number.isFinite(distance)) continue

    const cost = distance + edge.length
    if (best && cost >= best.cost) continue

    best = {
      cost,
      pathEdges: pathEdgesToNode(targetNodeId, selectedNodeIds, dijkstra),
      targetEdge: edge,
      targetNodeId,
    }
  }

  return best
}

function multiSourceDijkstra(graph: RoadGraph, sourceNodeIds: ReadonlySet<string>): DijkstraState {
  const distances = new Map<string, number>()
  const previous = new Map<string, { edge: RoadGraphEdge; nodeId: string }>()
  const unsettled = new Set(graph.nodes.keys())

  for (const nodeId of graph.nodes.keys()) {
    distances.set(nodeId, sourceNodeIds.has(nodeId) ? 0 : Number.POSITIVE_INFINITY)
  }

  while (unsettled.size > 0) {
    let currentNodeId: string | null = null
    let currentDistance = Number.POSITIVE_INFINITY

    for (const nodeId of unsettled) {
      const distance = distances.get(nodeId) ?? Number.POSITIVE_INFINITY
      if (distance >= currentDistance) continue
      currentDistance = distance
      currentNodeId = nodeId
    }

    if (!currentNodeId || !Number.isFinite(currentDistance)) break
    unsettled.delete(currentNodeId)

    for (const edge of graph.adjacency.get(currentNodeId) ?? []) {
      const nextNodeId = edge.startNodeId === currentNodeId ? edge.endNodeId : edge.startNodeId
      if (!unsettled.has(nextNodeId)) continue
      const nextDistance = currentDistance + edge.length
      if (nextDistance >= (distances.get(nextNodeId) ?? Number.POSITIVE_INFINITY)) continue
      distances.set(nextNodeId, nextDistance)
      previous.set(nextNodeId, { edge, nodeId: currentNodeId })
    }
  }

  return { distances, previous }
}

function pathEdgesToNode(
  targetNodeId: string,
  sourceNodeIds: ReadonlySet<string>,
  dijkstra: DijkstraState,
) {
  const path: RoadGraphEdge[] = []
  let currentNodeId = targetNodeId
  let guard = 0

  while (!sourceNodeIds.has(currentNodeId) && guard < dijkstra.previous.size + 1) {
    const previous = dijkstra.previous.get(currentNodeId)
    if (!previous) break
    path.push(previous.edge)
    currentNodeId = previous.nodeId
    guard += 1
  }

  return path.reverse()
}

function addSelectedEdge(
  edge: RoadGraphEdge,
  selected: Map<string, RoadGraphEdge>,
  selectedNodeIds: Set<string>,
  servedParcelIds: Set<string>,
) {
  selected.set(edge.id, edge)
  selectedNodeIds.add(edge.startNodeId)
  selectedNodeIds.add(edge.endNodeId)
  for (const parcelId of serviceParcelIds(edge)) {
    servedParcelIds.add(parcelId)
  }
}

function bestStartEdge(edges: readonly RoadGraphEdge[]) {
  const serviceEdges = edges.filter((edge) => serviceParcelIds(edge).length > 0)
  return [...serviceEdges].sort((a, b) => {
    const aCoverage = serviceParcelIds(a).length
    const bCoverage = serviceParcelIds(b).length
    return a.length / aCoverage - b.length / bCoverage || collectorScore(b) - collectorScore(a)
  })[0]
}

function serviceParcelIds(edge: { length: number; parcelIds: readonly string[] }) {
  return edge.parcelIds.length > 1 && edge.length >= MIN_SERVICE_EDGE_LENGTH ? edge.parcelIds : []
}

function selectedEdgesConnected(edges: readonly RoadGraphEdge[]) {
  const firstEdge = edges[0]
  if (!firstEdge) return true

  const adjacency = new Map<string, Set<string>>()
  for (const edge of edges) {
    if (!adjacency.has(edge.startNodeId)) adjacency.set(edge.startNodeId, new Set())
    if (!adjacency.has(edge.endNodeId)) adjacency.set(edge.endNodeId, new Set())
    adjacency.get(edge.startNodeId)?.add(edge.endNodeId)
    adjacency.get(edge.endNodeId)?.add(edge.startNodeId)
  }

  const visited = new Set<string>([firstEdge.startNodeId])
  const queue = [firstEdge.startNodeId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue
      visited.add(next)
      queue.push(next)
    }
  }

  return edges.every((edge) => visited.has(edge.startNodeId) && visited.has(edge.endNodeId))
}

function streetSegmentsConnected(segments: readonly ParcelStreetSegment[]) {
  return segments.length > 0 && streetSegmentComponentCount(segments) <= 1
}

function streetSegmentComponentCount(segments: readonly ParcelStreetSegment[]) {
  const firstSegment = segments[0]
  if (!firstSegment) return 0

  const adjacency = new Map<string, Set<string>>()
  for (const segment of segments) {
    const start = segment.points[0]
    const end = segment.points.at(-1)
    if (!(start && end)) continue
    const startNodeId = nodeIdForPoint(start)
    const endNodeId = nodeIdForPoint(end)
    if (!adjacency.has(startNodeId)) adjacency.set(startNodeId, new Set())
    if (!adjacency.has(endNodeId)) adjacency.set(endNodeId, new Set())
    adjacency.get(startNodeId)?.add(endNodeId)
    adjacency.get(endNodeId)?.add(startNodeId)
  }

  const firstStart = firstSegment.points[0]
  if (!firstStart) return 0

  let componentCount = 0
  const visited = new Set<string>()
  for (const nodeId of adjacency.keys()) {
    if (visited.has(nodeId)) continue
    componentCount += 1
    const queue = [nodeId]
    visited.add(nodeId)

    while (queue.length > 0) {
      const current = queue.shift()!
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) continue
        visited.add(next)
        queue.push(next)
      }
    }
  }

  return componentCount
}

function addEdgeSpan(
  nodes: Map<string, LandrushPoint2>,
  edgeMap: Map<string, { end: LandrushPoint2; parcelIds: Set<string>; start: LandrushPoint2 }>,
  start: LandrushPoint2,
  end: LandrushPoint2,
  parcelIds: readonly string[],
) {
  const startNodeId = nodeIdForPoint(start)
  const endNodeId = nodeIdForPoint(end)
  if (startNodeId === endNodeId) return

  nodes.set(startNodeId, start)
  nodes.set(endNodeId, end)
  const key = edgeKey(startNodeId, endNodeId)
  const current = edgeMap.get(key)
  if (current) {
    for (const parcelId of parcelIds) current.parcelIds.add(parcelId)
  } else {
    edgeMap.set(key, {
      end,
      parcelIds: new Set(parcelIds),
      start,
    })
  }
}

function neighborParcelPairs(allocation: ParcelAllocationResult) {
  const parcelById = new Map(allocation.parcels.map((parcel) => [parcel.id, parcel]))
  const pairs: Array<
    readonly [ParcelAllocationResult['parcels'][number], ParcelAllocationResult['parcels'][number]]
  > = []

  for (const parcel of allocation.parcels) {
    for (const neighborId of parcel.neighborIds) {
      if (parcel.id >= neighborId) continue
      const neighbor = parcelById.get(neighborId)
      if (neighbor) pairs.push([parcel, neighbor])
    }
  }

  return pairs
}

function segmentOverlap(
  firstStart: LandrushPoint2,
  firstEnd: LandrushPoint2,
  secondStart: LandrushPoint2,
  secondEnd: LandrushPoint2,
) {
  const dx = firstEnd.x - firstStart.x
  const dz = firstEnd.z - firstStart.z
  const length = Math.hypot(dx, dz)
  if (length <= EPSILON) return null

  const unit = { x: dx / length, z: dz / length }
  const secondDx = secondEnd.x - secondStart.x
  const secondDz = secondEnd.z - secondStart.z
  const secondLength = Math.hypot(secondDx, secondDz)
  if (secondLength <= EPSILON) return null
  if (Math.abs(dx * secondDz - dz * secondDx) / (length * secondLength) > 0.003) return null
  if (
    distanceToLine(secondStart, firstStart, firstEnd) > 0.08 ||
    distanceToLine(secondEnd, firstStart, firstEnd) > 0.08
  ) {
    return null
  }

  const secondStartT = dot(
    { x: secondStart.x - firstStart.x, z: secondStart.z - firstStart.z },
    unit,
  )
  const secondEndT = dot({ x: secondEnd.x - firstStart.x, z: secondEnd.z - firstStart.z }, unit)
  const startT = Math.max(0, Math.min(secondStartT, secondEndT))
  const endT = Math.min(length, Math.max(secondStartT, secondEndT))
  const overlapLength = endT - startT
  if (overlapLength <= 0) return null

  return {
    end: { x: firstStart.x + unit.x * endT, z: firstStart.z + unit.z * endT },
    length: overlapLength,
    start: { x: firstStart.x + unit.x * startT, z: firstStart.z + unit.z * startT },
  }
}

function splitPointsForRawEdge(edge: RawParcelEdge, rawEdges: readonly RawParcelEdge[]) {
  const points = [edge.start, edge.end]
  const vector = { x: edge.end.x - edge.start.x, z: edge.end.z - edge.start.z }
  const lengthSquared = vector.x * vector.x + vector.z * vector.z

  if (lengthSquared <= EPSILON) return points

  for (const candidateEdge of rawEdges) {
    for (const point of [candidateEdge.start, candidateEdge.end] as const) {
      if (pointOnSegment(point, edge.start, edge.end)) {
        points.push(point)
      }
    }
  }

  return dedupePoints(points).sort((a, b) => {
    const aT = ((a.x - edge.start.x) * vector.x + (a.z - edge.start.z) * vector.z) / lengthSquared
    const bT = ((b.x - edge.start.x) * vector.x + (b.z - edge.start.z) * vector.z) / lengthSquared
    return aT - bT
  })
}

function parcelEdges(parcelId: string, points: readonly LandrushPoint2[]) {
  const edges: RawParcelEdge[] = []

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    if (!(start && end) || distance2(start, end) <= EPSILON) continue
    edges.push({ end, parcelId, start })
  }

  return edges
}

function pointOnSegment(point: LandrushPoint2, start: LandrushPoint2, end: LandrushPoint2) {
  const length = distance2(start, end)
  if (length <= EPSILON) return false
  if (distanceToLine(point, start, end) > 0.035) return false

  const dotStart = (point.x - start.x) * (end.x - start.x) + (point.z - start.z) * (end.z - start.z)
  const dotEnd = (point.x - end.x) * (start.x - end.x) + (point.z - end.z) * (start.z - end.z)
  return dotStart >= -0.04 && dotEnd >= -0.04
}

function dedupePoints(points: readonly LandrushPoint2[]) {
  const byId = new Map<string, LandrushPoint2>()
  for (const point of points) {
    byId.set(nodeIdForPoint(point), point)
  }
  return [...byId.values()]
}

function compareRoadEdges(first: RoadGraphEdge, second: RoadGraphEdge) {
  return first.length - second.length || collectorScore(second) - collectorScore(first)
}

function collectorScore(edge: RoadGraphEdge) {
  return edge.centrality * 0.62 + edge.alignment * 0.38
}

function principalAxis(points: readonly LandrushPoint2[]) {
  const center = averagePoint(points)
  let xx = 0
  let zz = 0
  let xz = 0

  for (const point of points) {
    const dx = point.x - center.x
    const dz = point.z - center.z
    xx += dx * dx
    zz += dz * dz
    xz += dx * dz
  }

  const angle =
    Math.abs(xx - zz) < EPSILON && Math.abs(xz) < EPSILON ? 0 : Math.atan2(2 * xz, xx - zz) / 2
  return { x: Math.cos(angle), z: Math.sin(angle) }
}

function nodeIdForPoint(point: LandrushPoint2) {
  return `${Math.round(point.x * NODE_PRECISION)}:${Math.round(point.z * NODE_PRECISION)}`
}

function edgeKey(firstNodeId: string, secondNodeId: string) {
  return firstNodeId < secondNodeId
    ? `${firstNodeId}|${secondNodeId}`
    : `${secondNodeId}|${firstNodeId}`
}

function distanceToLine(point: LandrushPoint2, start: LandrushPoint2, end: LandrushPoint2) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const length = Math.hypot(dx, dz) || EPSILON
  return Math.abs((point.x - start.x) * dz - (point.z - start.z) * dx) / length
}

function distanceToSegment(point: LandrushPoint2, start: LandrushPoint2, end: LandrushPoint2) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const lengthSquared = dx * dx + dz * dz || EPSILON
  const t = clamp01(((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared)
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t))
}

function distanceToBoundary(point: LandrushPoint2, boundary: readonly LandrushPoint2[]) {
  let distance = Number.POSITIVE_INFINITY

  for (let index = 0; index < boundary.length; index += 1) {
    const start = boundary[index]
    const end = boundary[(index + 1) % boundary.length]
    if (start && end) distance = Math.min(distance, distanceToSegment(point, start, end))
  }

  return distance
}

function averagePoint(points: readonly LandrushPoint2[]) {
  if (points.length === 0) return { x: 0, z: 0 }
  let x = 0
  let z = 0
  for (const point of points) {
    x += point.x
    z += point.z
  }
  return { x: x / points.length, z: z / points.length }
}

function pointInPolygon(point: LandrushPoint2, polygon: readonly LandrushPoint2[]) {
  let inside = false

  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; index += 1) {
    const current = polygon[index]
    const previous = polygon[previousIndex]
    if (!(current && previous)) continue

    const crosses =
      current.z > point.z !== previous.z > point.z &&
      point.x <
        ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z || EPSILON) +
          current.x
    if (crosses) inside = !inside
    previousIndex = index
  }

  return inside
}

function midpoint2(first: LandrushPoint2, second: LandrushPoint2): LandrushPoint2 {
  return {
    x: (first.x + second.x) / 2,
    z: (first.z + second.z) / 2,
  }
}

function normalize2(point: LandrushPoint2) {
  const length = Math.hypot(point.x, point.z)
  return length > EPSILON ? { x: point.x / length, z: point.z / length } : { x: 0, z: 0 }
}

function dot(first: LandrushPoint2, second: LandrushPoint2) {
  return first.x * second.x + first.z * second.z
}

function distance2(first: LandrushPoint2, second: LandrushPoint2) {
  return Math.hypot(first.x - second.x, first.z - second.z)
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function createRandom(seed: string): RandomSource {
  let state = 2166136261

  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index)
    state = Math.imul(state, 16777619)
  }

  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
