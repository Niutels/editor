import type {
  LandrushBounds,
  LandrushGenerationMetadata,
  LandrushGeneratorOptions,
  LandrushIsland,
  LandrushIslandShapeControls,
  LandrushMetadataCheck,
  LandrushOwner,
  LandrushParcel,
  LandrushParcelEdge,
  LandrushPerimeter,
  LandrushPoint2,
  LandrushRoadNetwork,
  LandrushRoadNode,
  LandrushRoadSegment,
  LandrushSidewalkSegment,
  LandrushSize,
  LandrushTree,
  LandrushTreeBand,
  LandrushTreeKind,
  LandrushVec3,
} from './types'

const TAU = Math.PI * 2
const POINT_EPSILON = 0.001

export const DEFAULT_LANDRUSH_OPTIONS = {
  seed: 'landrush-default',
  size: { width: 100, depth: 100 },
  parcelCount: 10,
  perimeterPointCount: 64,
  treeSpacing: 7.5,
} as const

const DEFAULT_LANDRUSH_ISLAND_SHAPE = {
  asymmetry: 1,
  coast: 1,
  lobes: 1,
  roughness: 1,
} satisfies LandrushIslandShapeControls

const OWNER_COLORS = [
  '#f4c430',
  '#5db7de',
  '#68b684',
  '#d98282',
  '#b989d6',
  '#e59f71',
  '#74a7a3',
  '#d7d36f',
  '#90a4d4',
  '#cf7eac',
] as const

const PARCEL_COLORS = [
  '#cfe7b6',
  '#b9d7a5',
  '#d8e5aa',
  '#b7dfcb',
  '#d3ddb1',
  '#c4e0b2',
  '#cde1bf',
  '#b8d6bd',
  '#d9e3be',
  '#bfddb0',
] as const

const TREE_KINDS: readonly LandrushTreeKind[] = ['canopy', 'pine', 'flowering']

type RandomSource = () => number

interface RoadGraphAnalysis {
  readonly adjacency: Record<string, readonly string[]>
  readonly connected: boolean
  readonly connectedParcelIds: readonly string[]
  readonly reachableNodeCount: number
  readonly totalNodeCount: number
}

export function generateLandrushIsland(options: LandrushGeneratorOptions = {}): LandrushIsland {
  const seed = String(options.seed ?? DEFAULT_LANDRUSH_OPTIONS.seed)
  const random = createRandom(seed)
  const ownerRandom = createRandom(`${seed}:owner`)
  const size = normalizeSize(options.size)
  const parcelCount = clampInteger(
    options.parcelCount ?? DEFAULT_LANDRUSH_OPTIONS.parcelCount,
    1,
    24,
  )
  const ownerParcelIndex = clampInteger(
    options.ownerParcelIndex ?? Math.floor(ownerRandom() * parcelCount),
    0,
    parcelCount - 1,
  )
  const shape = normalizeIslandShapeControls(options.shape)

  const perimeter = createPerimeter(
    size,
    options.perimeterPointCount ?? DEFAULT_LANDRUSH_OPTIONS.perimeterPointCount,
    random,
    shape,
  )
  const parcels = createParcels(size, parcelCount, ownerParcelIndex, perimeter, random)
  const ownerParcel = parcels[ownerParcelIndex]!
  const roads = createRoadNetwork(parcels)
  const trees = createTrees(
    perimeter,
    parcels,
    options.treeSpacing ?? DEFAULT_LANDRUSH_OPTIONS.treeSpacing,
    random,
  )
  const metadata = createMetadata(
    seed,
    size,
    parcelCount,
    perimeter,
    parcels,
    ownerParcel,
    roads,
    trees,
  )

  return {
    id: `landrush-${slugSeed(seed)}`,
    seed,
    size,
    perimeter,
    parcels,
    ownerParcel,
    roads,
    trees,
    metadata,
  }
}

export function landrushPointToVec3(point: LandrushPoint2, y = 0): LandrushVec3 {
  return [point.x, round(y), point.z]
}

export function landrushPointsToVec3(
  points: readonly LandrushPoint2[],
  y = 0,
): readonly LandrushVec3[] {
  return points.map((point) => landrushPointToVec3(point, y))
}

export function summarizeLandrushIsland(island: LandrushIsland): string {
  return island.metadata.summary
}

function normalizeSize(size: Partial<LandrushSize> | undefined): LandrushSize {
  return {
    width: clampFinite(size?.width ?? DEFAULT_LANDRUSH_OPTIONS.size.width, 24, 500),
    depth: clampFinite(size?.depth ?? DEFAULT_LANDRUSH_OPTIONS.size.depth, 24, 500),
  }
}

function normalizeIslandShapeControls(
  shape: Partial<LandrushIslandShapeControls> | undefined,
): LandrushIslandShapeControls {
  return {
    asymmetry: clampFinite(shape?.asymmetry ?? DEFAULT_LANDRUSH_ISLAND_SHAPE.asymmetry, 0, 2),
    coast: clampFinite(shape?.coast ?? DEFAULT_LANDRUSH_ISLAND_SHAPE.coast, 0, 2),
    lobes: clampFinite(shape?.lobes ?? DEFAULT_LANDRUSH_ISLAND_SHAPE.lobes, 0, 2),
    roughness: clampFinite(shape?.roughness ?? DEFAULT_LANDRUSH_ISLAND_SHAPE.roughness, 0, 2),
  }
}

function createPerimeter(
  size: LandrushSize,
  requestedPointCount: number,
  random: RandomSource,
  shape: LandrushIslandShapeControls,
): LandrushPerimeter {
  const pointCount = clampInteger(requestedPointCount, 12, 128)
  const halfWidth = size.width / 2
  const halfDepth = size.depth / 2
  const phaseA = random() * TAU
  const phaseB = random() * TAU
  const phaseC = random() * TAU
  const phaseD = random() * TAU
  const coves = Array.from({ length: 6 }, () => ({
    angle: random() * TAU,
    amplitude: (0.14 + random() * 0.22) * shape.coast,
    power: 2.1 + random() * 2.3,
  }))
  const capes = Array.from({ length: 5 }, () => ({
    angle: random() * TAU,
    amplitude: (0.09 + random() * 0.17) * shape.coast,
    power: 1.8 + random() * 1.65,
  }))
  const leanAngle = random() * TAU
  const aspectLean = 1 + (0.88 + random() * 0.2 - 1) * shape.asymmetry
  const counterAspectLean = 1 + (0.94 + random() * 0.12 - 1) * shape.asymmetry
  const scallopPhase = random() * TAU
  const rawPoints: LandrushPoint2[] = []

  for (let index = 0; index < pointCount; index += 1) {
    const angle = (index / pointCount) * TAU
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const lobeWave = Math.sin(angle * 2 + phaseA) * 0.22 * shape.lobes
    const coveWave = Math.sin(angle * 3 + phaseB) * 0.12 * shape.coast
    const fineWave = Math.sin(angle * 7 + phaseC) * 0.055 * shape.roughness
    const terraceWave = Math.sin(angle * 11 + phaseD) * 0.034 * shape.roughness
    const scallopWave = Math.sin(angle * 5 + scallopPhase) * 0.075 * shape.roughness
    const covePull = coves.reduce(
      (total, cove) => total - localizedWave(angle, cove.angle, cove.amplitude, cove.power),
      0,
    )
    const capePush = capes.reduce(
      (total, cape) => total + localizedWave(angle, cape.angle, cape.amplitude, cape.power),
      0,
    )
    const jitter = (random() - 0.5) * 0.055 * shape.roughness
    const radiusScale = clampFinite(
      0.9 +
        lobeWave +
        coveWave +
        fineWave +
        terraceWave +
        scallopWave +
        covePull +
        capePush +
        jitter,
      0.44,
      1.34,
    )
    const directionalLean = 1 + Math.cos(angle - leanAngle) * 0.11 * shape.asymmetry
    const roundnessBias =
      0.9 +
      0.08 * Math.abs(Math.sin(angle * 2 + phaseB)) * shape.asymmetry +
      Math.sin(angle + phaseD) * 0.035 * shape.roughness

    rawPoints.push(
      point(
        cos * halfWidth * radiusScale * directionalLean * aspectLean,
        sin * halfDepth * radiusScale * roundnessBias * counterAspectLean,
      ),
    )
  }

  const rawBounds = boundsFor(rawPoints)
  const centerX = (rawBounds.minX + rawBounds.maxX) / 2
  const centerZ = (rawBounds.minZ + rawBounds.maxZ) / 2
  const uniformScale =
    Math.min(
      (size.width * 0.985) / Math.max(rawBounds.width, POINT_EPSILON),
      (size.depth * 0.965) / Math.max(rawBounds.depth, POINT_EPSILON),
    ) *
    (0.97 + random() * 0.04)
  const shear = (random() - 0.5) * 0.12 * shape.asymmetry
  const openPoints = rawPoints.map((raw) => {
    const x = (raw.x - centerX) * uniformScale
    const z = (raw.z - centerZ) * uniformScale
    return point(x + z * shear, z)
  })
  const first = openPoints[0]!
  const points = [...openPoints, { ...first }]

  return {
    id: 'island-perimeter',
    points,
    r3fPoints: landrushPointsToVec3(points),
    bounds: boundsFor(points),
    closed: areSamePoint(points[0]!, points[points.length - 1]!),
  }
}

function localizedWave(angle: number, center: number, amplitude: number, power: number): number {
  return Math.max(0, Math.cos(angle - center)) ** power * amplitude
}

function createParcels(
  size: LandrushSize,
  parcelCount: number,
  ownerParcelIndex: number,
  perimeter: LandrushPerimeter,
  random: RandomSource,
): LandrushParcel[] {
  const columns = Math.ceil(parcelCount / 2)
  const rows = Math.ceil(parcelCount / columns)
  const xSpan = size.width * 0.58
  const zSpan = rows > 1 ? size.depth * 0.34 : 0
  const xStep = columns > 1 ? xSpan / (columns - 1) : 0
  const zStep = rows > 1 ? zSpan / (rows - 1) : 0
  const radius = Math.min(size.width / (Math.max(columns, 1) * 2.82), size.depth / 13.7, 7.35)
  const parcels: LandrushParcel[] = []

  for (let index = 0; index < parcelCount; index += 1) {
    const row = Math.floor(index / columns)
    const column = index % columns
    const rawCenter = point(
      -xSpan / 2 + column * xStep + (random() - 0.5) * radius * 0.32,
      -zSpan / 2 + row * zStep + (random() - 0.5) * radius * 0.22,
    )
    const center = separateParcelCenter(
      fitParcelCenterInsidePerimeter(rawCenter, radius, perimeter),
      radius,
      parcels,
      perimeter,
    )
    const parcel = createParcel(index, center, radius, index === ownerParcelIndex, random)
    parcels.push(parcel)
  }

  return parcels
}

function fitParcelCenterInsidePerimeter(
  center: LandrushPoint2,
  radius: number,
  perimeter: LandrushPerimeter,
): LandrushPoint2 {
  let candidate = center
  const clearanceRadius = radius * 1.34

  for (let attempt = 0; attempt < 18; attempt += 1) {
    if (isParcelFootprintInsidePerimeter(candidate, clearanceRadius, perimeter)) {
      return candidate
    }
    candidate = point(candidate.x * 0.88, candidate.z * 0.88)
  }

  return candidate
}

function separateParcelCenter(
  center: LandrushPoint2,
  radius: number,
  parcels: readonly LandrushParcel[],
  perimeter: LandrushPerimeter,
): LandrushPoint2 {
  let candidate = center
  const minDistance = radius * 1.95

  for (let attempt = 0; attempt < 10; attempt += 1) {
    let moved = false
    for (const parcel of parcels) {
      const dx = candidate.x - parcel.center.x
      const dz = candidate.z - parcel.center.z
      const length = Math.max(Math.hypot(dx, dz), POINT_EPSILON)
      if (length >= minDistance) continue
      const push = (minDistance - length) * 0.62
      candidate = point(candidate.x + (dx / length) * push, candidate.z + (dz / length) * push)
      candidate = fitParcelCenterInsidePerimeter(candidate, radius, perimeter)
      moved = true
    }
    if (!moved) return candidate
  }

  return candidate
}

function isParcelFootprintInsidePerimeter(
  center: LandrushPoint2,
  radius: number,
  perimeter: LandrushPerimeter,
): boolean {
  if (!pointInPolygon(center, perimeter.points)) return false

  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * TAU
    const sample = point(center.x + Math.cos(angle) * radius, center.z + Math.sin(angle) * radius)
    if (!pointInPolygon(sample, perimeter.points)) return false
  }

  return true
}

function createParcel(
  index: number,
  center: LandrushPoint2,
  radius: number,
  isOwner: boolean,
  random: RandomSource,
): LandrushParcel {
  const id = `parcel-${String(index + 1).padStart(2, '0')}`
  const owner = createOwner(index, isOwner)
  const vertices = createParcelVertices(index, center, radius, random)
  const edges = createParcelEdges(id, vertices, radius, random)
  const outline = createOutlineFromEdges(edges)
  const centroid = centroidFor(vertices)
  const directionToRoad = center.z >= 0 ? -1 : 1
  const entryPoint = point(
    center.x + (random() - 0.5) * radius * 0.28,
    center.z + directionToRoad * radius * 1.08,
  )

  return {
    id,
    index,
    kind: isOwner ? 'owner' : 'neighbor',
    label: isOwner ? 'Owner Parcel' : `Parcel ${index + 1}`,
    center,
    centroid,
    radius,
    owner,
    vertices,
    outline,
    r3fOutline: landrushPointsToVec3(outline, 0.025),
    edges,
    entryPoint,
    r3fEntryPoint: landrushPointToVec3(entryPoint, 0.035),
    fillColor: isOwner ? '#f7d154' : PARCEL_COLORS[index % PARCEL_COLORS.length]!,
  }
}

function createOwner(index: number, isOwner: boolean): LandrushOwner {
  if (isOwner) {
    return {
      id: 'owner',
      label: 'Player Owner',
      accentColor: '#f4c430',
    }
  }

  return {
    id: `neighbor-${String(index + 1).padStart(2, '0')}`,
    label: `Neighbor ${index + 1}`,
    accentColor: OWNER_COLORS[index % OWNER_COLORS.length]!,
  }
}

function createParcelVertices(
  index: number,
  center: LandrushPoint2,
  radius: number,
  random: RandomSource,
): LandrushPoint2[] {
  const edgeReduction = (index + Math.floor(random() * 3)) % 3
  const vertexCount = 6 - edgeReduction
  const phase = random() * TAU
  const xScale = 0.96 + random() * 0.14
  const zScale = 0.9 + random() * 0.2
  const vertices: LandrushPoint2[] = []

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const baseAngle = phase + (vertexIndex / vertexCount) * TAU
    const angle = baseAngle + (random() - 0.5) * 0.14
    const vertexRadius = radius * (0.86 + random() * 0.27)
    vertices.push(
      point(
        center.x + Math.cos(angle) * vertexRadius * xScale,
        center.z + Math.sin(angle) * vertexRadius * zScale,
      ),
    )
  }

  return vertices
}

function createParcelEdges(
  parcelId: string,
  vertices: readonly LandrushPoint2[],
  radius: number,
  random: RandomSource,
): LandrushParcelEdge[] {
  const edges: LandrushParcelEdge[] = []

  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index]!
    const end = vertices[(index + 1) % vertices.length]!
    const edgeVector = { x: end.x - start.x, z: end.z - start.z }
    const edgeLength = Math.max(distance(start, end), POINT_EPSILON)
    const normal = { x: -edgeVector.z / edgeLength, z: edgeVector.x / edgeLength }
    const bow = (random() - 0.5) * radius * 0.34
    const control = point(
      (start.x + end.x) / 2 + normal.x * bow,
      (start.z + end.z) / 2 + normal.z * bow,
    )
    const samples = sampleQuadratic(start, control, end, 5)

    edges.push({
      id: `${parcelId}-edge-${index + 1}`,
      start,
      end,
      control,
      samples,
      r3fSamples: landrushPointsToVec3(samples, 0.04),
    })
  }

  return edges
}

function createOutlineFromEdges(edges: readonly LandrushParcelEdge[]): LandrushPoint2[] {
  const outline: LandrushPoint2[] = []

  for (const edge of edges) {
    outline.push(...edge.samples.slice(0, -1))
  }

  const first = outline[0]
  if (first) {
    outline.push({ ...first })
  }

  return outline
}

function createRoadNetwork(parcels: readonly LandrushParcel[]): LandrushRoadNetwork {
  const entryNodes = parcels.map<LandrushRoadNode>((parcel) => ({
    id: `road-entry-${parcel.id}`,
    kind: 'parcel-entry',
    parcelId: parcel.id,
    position: parcel.entryPoint,
    r3fPosition: landrushPointToVec3(parcel.entryPoint, 0.045),
  }))

  const nodes = [...entryNodes]
  const segments: LandrushRoadSegment[] = []
  const lowerRow = parcels
    .filter((parcel) => parcel.center.z < 0)
    .sort((a, b) => a.center.x - b.center.x)
  const upperRow = parcels
    .filter((parcel) => parcel.center.z >= 0)
    .sort((a, b) => a.center.x - b.center.x)

  for (const row of [lowerRow, upperRow] as const) {
    for (let index = 0; index < row.length - 1; index += 1) {
      const fromParcel = row[index]!
      const toParcel = row[index + 1]!
      const from = entryNodes.find((node) => node.id === `road-entry-${fromParcel.id}`)!
      const to = entryNodes.find((node) => node.id === `road-entry-${toParcel.id}`)!
      segments.push(
        createRoadSegment(
          `road-frontage-${fromParcel.id}-${toParcel.id}`,
          'spine',
          from,
          to,
          2.25,
          [fromParcel.id, toParcel.id],
          createFrontageRoadPoints(fromParcel, toParcel),
        ),
      )
    }
  }

  const columnCount = Math.max(lowerRow.length, upperRow.length)
  for (let index = 0; index < columnCount; index += 1) {
    const lower = lowerRow[index]
    const upper = upperRow[index]
    if (!(lower && upper)) continue

    const from = entryNodes.find((node) => node.id === `road-entry-${lower.id}`)!
    const to = entryNodes.find((node) => node.id === `road-entry-${upper.id}`)!
    segments.push(
      createRoadSegment(
        `road-cross-${lower.id}-${upper.id}`,
        'spine',
        from,
        to,
        2.15,
        [lower.id, upper.id],
        createCrossRoadPoints(lower, upper),
      ),
    )
  }

  const graph = analyzeRoadGraph(nodes, segments)

  return {
    nodes,
    segments,
    sidewalks: createSidewalks(segments),
    adjacency: graph.adjacency,
    connected: graph.connected,
    connectedParcelIds: graph.connectedParcelIds,
  }
}

function createRoadSegment(
  id: string,
  kind: 'spine' | 'driveway',
  from: LandrushRoadNode,
  to: LandrushRoadNode,
  width: number,
  connectsParcelIds: readonly string[],
  overridePoints?: readonly LandrushPoint2[],
): LandrushRoadSegment {
  const points = overridePoints
    ? [...overridePoints]
    : createRoadSegmentPoints(kind, from.position, to.position)

  return {
    id,
    kind,
    fromNodeId: from.id,
    toNodeId: to.id,
    points,
    r3fPoints: landrushPointsToVec3(points, 0.03),
    width,
    connectsParcelIds,
  }
}

function createFrontageRoadPoints(
  fromParcel: LandrushParcel,
  toParcel: LandrushParcel,
): LandrushPoint2[] {
  const from = fromParcel.entryPoint
  const to = toParcel.entryPoint
  const rowDirection = fromParcel.center.z < 0 ? 1 : -1
  const fromSetback = point(from.x, from.z + rowDirection * fromParcel.radius * 0.35)
  const toSetback = point(to.x, to.z + rowDirection * toParcel.radius * 0.35)
  const mid = point((fromSetback.x + toSetback.x) / 2, (fromSetback.z + toSetback.z) / 2)
  const curve = point(mid.x, mid.z + rowDirection * Math.min(2.8, fromParcel.radius * 0.38))

  return [from, fromSetback, curve, toSetback, to]
}

function createCrossRoadPoints(
  lowerParcel: LandrushParcel,
  upperParcel: LandrushParcel,
): LandrushPoint2[] {
  const lower = lowerParcel.entryPoint
  const upper = upperParcel.entryPoint
  const midZ = (lower.z + upper.z) / 2
  const xDrift = (upper.x - lower.x) * 0.22

  return [
    lower,
    point(lower.x + xDrift, lower.z + lowerParcel.radius * 0.62),
    point((lower.x + upper.x) / 2, midZ),
    point(upper.x - xDrift, upper.z - upperParcel.radius * 0.62),
    upper,
  ]
}

function createRoadSegmentPoints(
  kind: LandrushRoadSegment['kind'],
  from: LandrushPoint2,
  to: LandrushPoint2,
): LandrushPoint2[] {
  if (kind !== 'driveway') return [from, to]

  const deltaX = to.x - from.x
  const deltaZ = to.z - from.z
  const directionZ = deltaZ === 0 ? 1 : Math.sign(deltaZ)
  const lengthZ = Math.abs(deltaZ)
  const bendDistance = Math.min(lengthZ * 0.42, 8.5)
  const entrySetback = Math.min(lengthZ * 0.24, 2.4)

  return [
    from,
    point(from.x + deltaX * 0.18, from.z + directionZ * bendDistance),
    point(to.x - deltaX * 0.18, to.z - directionZ * entrySetback),
    to,
  ]
}

function createSidewalks(roadSegments: readonly LandrushRoadSegment[]): LandrushSidewalkSegment[] {
  const sidewalks: LandrushSidewalkSegment[] = []

  for (const segment of roadSegments) {
    const offset = segment.width / 2 + 0.34

    for (const side of ['left', 'right'] as const) {
      const sideMultiplier = side === 'left' ? 1 : -1
      const points = offsetPolyline(segment.points, offset * sideMultiplier)

      sidewalks.push({
        id: `sidewalk-${segment.id}-${side}`,
        roadSegmentId: segment.id,
        side,
        points,
        r3fPoints: landrushPointsToVec3(points, 0.05),
        width: 0.58,
        connectsParcelIds: segment.connectsParcelIds,
      })
    }
  }

  return sidewalks
}

function offsetPolyline(points: readonly LandrushPoint2[], offset: number): LandrushPoint2[] {
  return points.map((current, index) => {
    const normal = normalAtPolylinePoint(points, index)
    return point(current.x + normal.x * offset, current.z + normal.z * offset)
  })
}

function normalAtPolylinePoint(points: readonly LandrushPoint2[], index: number): LandrushPoint2 {
  const current = points[index]
  if (!current) return point(0, 0)

  const previous = points[index - 1]
  const next = points[index + 1]
  if (!(previous || next)) return point(0, 0)

  const dx =
    next && previous ? next.x - previous.x : next ? next.x - current.x : current.x - previous!.x
  const dz =
    next && previous ? next.z - previous.z : next ? next.z - current.z : current.z - previous!.z
  const length = Math.max(Math.hypot(dx, dz), POINT_EPSILON)

  return {
    x: -dz / length,
    z: dx / length,
  }
}

function analyzeRoadGraph(
  nodes: readonly LandrushRoadNode[],
  segments: readonly LandrushRoadSegment[],
): RoadGraphAnalysis {
  const adjacency: Record<string, string[]> = {}

  for (const node of nodes) {
    adjacency[node.id] = []
  }

  for (const segment of segments) {
    adjacency[segment.fromNodeId]?.push(segment.toNodeId)
    adjacency[segment.toNodeId]?.push(segment.fromNodeId)
  }

  const startNode = nodes[0]
  if (!startNode) {
    return {
      adjacency,
      connected: false,
      connectedParcelIds: [],
      reachableNodeCount: 0,
      totalNodeCount: 0,
    }
  }

  const visited = new Set<string>()
  const stack = [startNode.id]

  while (stack.length > 0) {
    const nodeId = stack.pop()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    for (const neighborId of adjacency[nodeId] ?? []) {
      if (!visited.has(neighborId)) {
        stack.push(neighborId)
      }
    }
  }

  const connectedParcelIds = nodes
    .filter((node) => node.parcelId && visited.has(node.id))
    .map((node) => node.parcelId!)

  return {
    adjacency,
    connected: visited.size === nodes.length,
    connectedParcelIds,
    reachableNodeCount: visited.size,
    totalNodeCount: nodes.length,
  }
}

function createTrees(
  perimeter: LandrushPerimeter,
  parcels: readonly LandrushParcel[],
  requestedTreeSpacing: number,
  random: RandomSource,
): LandrushTree[] {
  const treeSpacing = clampFinite(requestedTreeSpacing, 3.5, 24)
  const trees: LandrushTree[] = []
  let treeIndex = 1

  for (let index = 0; index < perimeter.points.length - 1; index += 1) {
    const start = perimeter.points[index]!
    const end = perimeter.points[index + 1]!
    const segmentLength = distance(start, end)
    const count = Math.max(1, Math.floor(segmentLength / treeSpacing))
    const edgeVector = { x: end.x - start.x, z: end.z - start.z }
    const length = Math.max(segmentLength, POINT_EPSILON)
    const inwardNormal = { x: -edgeVector.z / length, z: edgeVector.x / length }

    for (let step = 0; step < count; step += 1) {
      if (random() < 0.18) continue
      const t = clamp01((step + 0.5 + (random() - 0.5) * 0.42) / count)
      const base = lerpPoint(start, end, t)
      const inset = 2.8 + random() * 4.8
      const position = point(base.x + inwardNormal.x * inset, base.z + inwardNormal.z * inset)
      if (!isTreePositionClear(position, parcels)) continue
      trees.push(createTree(`tree-${treeIndex}`, 'perimeter', position, random))
      treeIndex += 1
    }
  }

  const grassBounds = perimeter.bounds
  for (const parcel of parcels) {
    if (parcel.kind === 'owner') continue

    for (let index = 0; index < 2; index += 1) {
      const side = random() > 0.5 ? 1 : -1
      const awayFromRoad = parcel.center.z >= 0 ? 1 : -1
      const rawPosition = point(
        parcel.center.x + side * parcel.radius * (1.28 + random() * 0.42),
        parcel.center.z + awayFromRoad * parcel.radius * (0.78 + random() * 0.56),
      )
      const position = clampPointToBounds(rawPosition, grassBounds, 4)
      if (!isTreePositionClear(position, parcels)) continue
      trees.push(createTree(`tree-${treeIndex}`, 'grass', position, random))
      treeIndex += 1
    }
  }

  return trees
}

function createTree(
  id: string,
  band: LandrushTreeBand,
  position: LandrushPoint2,
  random: RandomSource,
): LandrushTree {
  const kind = TREE_KINDS[Math.floor(random() * TREE_KINDS.length)]!

  return {
    id,
    kind,
    band,
    position,
    r3fPosition: landrushPointToVec3(position, 0),
    rotation: round(random() * TAU),
    trunkHeight: round(1.5 + random() * 1.1),
    canopyRadius: round(kind === 'pine' ? 1.25 + random() * 0.8 : 1.65 + random() * 1.15),
  }
}

function isTreePositionClear(
  position: LandrushPoint2,
  parcels: readonly LandrushParcel[],
): boolean {
  return parcels.every((parcel) => {
    const clearance = parcel.kind === 'owner' ? parcel.radius * 2.35 : parcel.radius * 1.12
    return distance(position, parcel.centroid) > clearance
  })
}

function createMetadata(
  seed: string,
  requestedSize: LandrushSize,
  requestedParcelCount: number,
  perimeter: LandrushPerimeter,
  parcels: readonly LandrushParcel[],
  ownerParcel: LandrushParcel,
  roads: LandrushRoadNetwork,
  trees: readonly LandrushTree[],
): LandrushGenerationMetadata {
  const firstPerimeterPoint = perimeter.points[0]
  const lastPerimeterPoint = perimeter.points[perimeter.points.length - 1]
  const graph = analyzeRoadGraph(roads.nodes, roads.segments)
  const perimeterClosed =
    Boolean(firstPerimeterPoint && lastPerimeterPoint) &&
    areSamePoint(firstPerimeterPoint!, lastPerimeterPoint!)
  const connectedParcelCount = graph.connectedParcelIds.length
  const roadGraphConnected = graph.connected && connectedParcelCount === parcels.length

  const checks: readonly LandrushMetadataCheck[] = [
    {
      check: 'closed perimeter',
      pass: perimeterClosed,
      value: perimeterClosed,
    },
    {
      check: 'parcel count',
      pass: parcels.length === requestedParcelCount,
      value: `${parcels.length}/${requestedParcelCount}`,
    },
    {
      check: 'connected roads',
      pass: roadGraphConnected,
      value: `${connectedParcelCount}/${parcels.length} parcels`,
    },
  ]
  const summary = `Landrush ${seed}: ${parcels.length} parcels, perimeter closed=${perimeterClosed}, roads connected=${roadGraphConnected}`

  return {
    seed,
    requestedSize,
    actualBounds: perimeter.bounds,
    ownerParcelId: ownerParcel.id,
    checks,
    counts: {
      perimeterPoints: perimeter.points.length,
      parcels: parcels.length,
      roadNodes: roads.nodes.length,
      roadSegments: roads.segments.length,
      sidewalks: roads.sidewalks.length,
      trees: trees.length,
    },
    roadGraph: {
      connected: roadGraphConnected,
      reachableNodeCount: graph.reachableNodeCount,
      totalNodeCount: graph.totalNodeCount,
      connectedParcelIds: graph.connectedParcelIds,
    },
    summary,
  }
}

function sampleQuadratic(
  start: LandrushPoint2,
  control: LandrushPoint2,
  end: LandrushPoint2,
  steps: number,
): LandrushPoint2[] {
  const samples: LandrushPoint2[] = []

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps
    const inverse = 1 - t
    samples.push(
      point(
        inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
        inverse * inverse * start.z + 2 * inverse * t * control.z + t * t * end.z,
      ),
    )
  }

  return samples
}

function centroidFor(points: readonly LandrushPoint2[]): LandrushPoint2 {
  if (points.length === 0) return point(0, 0)

  let x = 0
  let z = 0

  for (const item of points) {
    x += item.x
    z += item.z
  }

  return point(x / points.length, z / points.length)
}

function boundsFor(points: readonly LandrushPoint2[]): LandrushBounds {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const item of points) {
    minX = Math.min(minX, item.x)
    maxX = Math.max(maxX, item.x)
    minZ = Math.min(minZ, item.z)
    maxZ = Math.max(maxZ, item.z)
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minZ) ||
    !Number.isFinite(maxZ)
  ) {
    return {
      minX: 0,
      maxX: 0,
      minZ: 0,
      maxZ: 0,
      width: 0,
      depth: 0,
    }
  }

  return {
    minX: round(minX),
    maxX: round(maxX),
    minZ: round(minZ),
    maxZ: round(maxZ),
    width: round(maxX - minX),
    depth: round(maxZ - minZ),
  }
}

function lerpPoint(start: LandrushPoint2, end: LandrushPoint2, t: number): LandrushPoint2 {
  return point(start.x + (end.x - start.x) * t, start.z + (end.z - start.z) * t)
}

function clampPointToBounds(
  pointValue: LandrushPoint2,
  bounds: LandrushBounds,
  margin: number,
): LandrushPoint2 {
  return point(
    clampFinite(pointValue.x, bounds.minX + margin, bounds.maxX - margin),
    clampFinite(pointValue.z, bounds.minZ + margin, bounds.maxZ - margin),
  )
}

function distance(a: LandrushPoint2, b: LandrushPoint2): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function areSamePoint(a: LandrushPoint2, b: LandrushPoint2): boolean {
  return Math.abs(a.x - b.x) <= POINT_EPSILON && Math.abs(a.z - b.z) <= POINT_EPSILON
}

function pointInPolygon(pointValue: LandrushPoint2, polygon: readonly LandrushPoint2[]): boolean {
  let inside = false

  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; index += 1) {
    const current = polygon[index]
    const previous = polygon[previousIndex]
    if (!(current && previous)) continue

    const intersects =
      current.z > pointValue.z !== previous.z > pointValue.z &&
      pointValue.x <
        ((previous.x - current.x) * (pointValue.z - current.z)) /
          (previous.z - current.z || POINT_EPSILON) +
          current.x
    if (intersects) inside = !inside
    previousIndex = index
  }

  return inside
}

function point(x: number, z: number): LandrushPoint2 {
  return {
    x: round(x),
    z: round(z),
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clampFinite(value, min, max))
}

function slugSeed(seed: string): string {
  const slug = seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

  return slug || 'seed'
}

function createRandom(seed: string): RandomSource {
  let state = hashSeed(seed)

  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(seed: string): number {
  let hash = 2166136261

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}
