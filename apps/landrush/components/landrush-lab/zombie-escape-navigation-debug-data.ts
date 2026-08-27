import {
  getZombieEscapeSparseCommittedRouteGeneration,
  inspectZombieEscapeSparseReverseFieldBanks,
  resolveZombieEscapePinnedNavigationLayerIndex,
  resolveZombieEscapeSparseEffectiveCommittedTarget,
  ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND,
  type ZombieEscapeCollisionBox,
  type ZombieEscapeCollisionCircle,
  type ZombieEscapeCollisionSegment,
  type ZombieEscapeCollisionWorld,
  type ZombieEscapeFlowField,
} from './zombie-escape-collision-world'
import {
  createZombieEscapeNavigationAgentInspection,
  inspectZombieEscapeNavigationAgent,
  ZOMBIE_ESCAPE_NAVIGATION_AGENT_ANOMALY,
  type ZombieEscapeNavigationAgentInspection,
} from './zombie-escape-navigation-inspection'
import type { ZombieEscapeSimulation, ZombieEscapeZombiePool } from './zombie-escape-simulation'
import type { ZombieEscapeSparseNavigationTargetRegionIndex } from './zombie-escape-sparse-navigation'

const REGION_AREA_EPSILON = 1e-10
const REGION_SURFACE_OFFSET_METERS = 0.015
const BOUNDARY_SURFACE_OFFSET_METERS = 0.035
const BOUNDARY_STRIP_HALF_WIDTH_METERS = 0.018
const FEATURE_SURFACE_OFFSET_METERS = 0.055
const ROUTE_SURFACE_OFFSET_METERS = 0.075
const GRAPH_EDGE_SURFACE_OFFSET_METERS = 0.095
const GRAPH_NODE_SURFACE_OFFSET_METERS = 0.115
const CIRCLE_SEGMENT_COUNT = 20

const FEATURE_COLOR = {
  boundaryFallback: [1, 0.68, 0.15] as const,
  boundaryStrict: [0.38, 0.9, 1] as const,
  blockerDoor: [1, 0.08, 0.12] as const,
  blockerFurniture: [1, 0.2, 0.28] as const,
  blockerOther: [0.72, 0.05, 0.12] as const,
  connector: [0.76, 0.36, 1] as const,
  door: [0.1, 0.88, 1] as const,
  furniture: [1, 0.48, 0.12] as const,
  graphConnector: [0.82, 0.46, 1] as const,
  graphFallback: [1, 0.52, 0.08] as const,
  graphFallbackOpen: [0.14, 0.94, 0.72] as const,
  graphNode: [0.82, 0.94, 1] as const,
  graphOrphan: [1, 0.08, 0.26] as const,
  graphStrict: [0.12, 0.68, 1] as const,
  graphWitness: [1, 0.9, 0.22] as const,
  regionFallback: [1, 0.55, 0.08] as const,
  regionStrict: [0.08, 0.56, 1] as const,
  routeFallback: [1, 0.78, 0.12] as const,
  routeStrict: [0.18, 1, 0.48] as const,
}

export const ZOMBIE_ESCAPE_NAVIGATION_DEBUG_FLOOR = {
  all: -2,
  auto: -1,
} as const

export type ZombieEscapeNavigationDebugLayerGeometry = Readonly<{
  boundaryTriangleColors: Float32Array
  boundaryTrianglePositions: Float32Array
  elevation: number
  featureLineColors: Float32Array
  featureLinePositions: Float32Array
  graphFeatureLineVertexCount: number
  graphNodeColors: Float32Array
  graphNodePositions: Float32Array
  regionOverlapMarkerPositions: Float32Array
  regionTriangleColors: Float32Array
  regionTrianglePositions: Float32Array
  strictBoundaryVertexCount: number
  strictRegionOverlapMarkerCount: number
  strictRegionVertexCount: number
}>

export type ZombieEscapeNavigationDebugStaticSnapshot = Readonly<{
  activationRevision: number
  graphFallbackOnlyEdgeCount: number
  graphNodeCount: number
  graphStrictEdgeCount: number
  layers: readonly ZombieEscapeNavigationDebugLayerGeometry[]
  semanticKey: string
  staticBytes: number
  worldRevision: string
}>

export type ZombieEscapeNavigationDebugRouteLayerGeometry = Readonly<{
  lineColors: Float32Array
  linePositions: Float32Array
  terminalAnchorColors: Float32Array
  terminalAnchorPositions: Float32Array
}>

export type ZombieEscapeNavigationDebugRouteSnapshot = Readonly<{
  generation: number
  layers: readonly ZombieEscapeNavigationDebugRouteLayerGeometry[]
  routeBytes: number
  targetLayerIndex: number
  worldRevision: string
}>

export type ZombieEscapeNavigationDebugLiveBuffers = {
  activeCount: number
  agentColors: Float32Array
  agentPositions: Float32Array
  anomalyCount: number
  anomalyPositions: Float32Array
  classificationActivationRevision: number
  classificationCollisionWorldGeneration: number
  classificationRouteGeneration: number
  classificationTargetRevision: number
  classifications: ZombieEscapeNavigationAgentInspection[]
  layerIndices: Int16Array
  linkCount: number
  linkColors: Float32Array
  linkPositions: Float32Array
  overlapCounts: Uint8Array
  slots: Int16Array
  terminalLinkCount: number
  visibleIndices: Int16Array
  visibleAnomalyCount: number
  visibleCount: number
}

export function createZombieEscapeNavigationDebugStaticSnapshot(
  world: ZombieEscapeCollisionWorld,
): ZombieEscapeNavigationDebugStaticSnapshot {
  const layerBuilders = world.navigationLayers.map((layer) => ({
    boundaries: [] as number[],
    boundaryColors: [] as number[],
    elevation: layer.elevation,
    featureColors: [] as number[],
    features: [] as number[],
    graphFeatureColors: [] as number[],
    graphFeatures: [] as number[],
    graphNodeColors: [] as number[],
    graphNodes: [] as number[],
    overlapMarkers: [] as number[],
    regions: [] as number[],
    regionColors: [] as number[],
    strictBoundaryVertexCount: 0,
    strictRegionOverlapMarkerCount: 0,
    strictRegionVertexCount: 0,
  }))
  appendNavigationRegionGeometry(world, layerBuilders)
  const graphCounts = appendNavigationGraphGeometry(world, layerBuilders)
  appendNavigationConnectorGeometry(world, layerBuilders)
  appendNavigationDoorLinkGeometry(world, layerBuilders)
  appendNavigationColliderGeometry(world, layerBuilders)

  const layers = layerBuilders.map((builder) => {
    const featureLineColors = Float32Array.from([
      ...builder.graphFeatureColors,
      ...builder.featureColors,
    ])
    const featureLinePositions = Float32Array.from([...builder.graphFeatures, ...builder.features])
    return {
      boundaryTriangleColors: Float32Array.from(builder.boundaryColors),
      boundaryTrianglePositions: Float32Array.from(builder.boundaries),
      elevation: builder.elevation,
      featureLineColors,
      featureLinePositions,
      graphFeatureLineVertexCount: builder.graphFeatures.length / 3,
      graphNodeColors: Float32Array.from(builder.graphNodeColors),
      graphNodePositions: Float32Array.from(builder.graphNodes),
      regionOverlapMarkerPositions: Float32Array.from(builder.overlapMarkers),
      regionTriangleColors: Float32Array.from(builder.regionColors),
      regionTrianglePositions: Float32Array.from(builder.regions),
      strictBoundaryVertexCount: builder.strictBoundaryVertexCount,
      strictRegionOverlapMarkerCount: builder.strictRegionOverlapMarkerCount,
      strictRegionVertexCount: builder.strictRegionVertexCount,
    }
  })
  return {
    activationRevision: world.activationRevision,
    graphFallbackOnlyEdgeCount: graphCounts.fallbackOnlyEdgeCount,
    graphNodeCount: world.navigationGraph.nodeIds.length,
    graphStrictEdgeCount: graphCounts.strictEdgeCount,
    layers,
    semanticKey: world.semanticKey,
    staticBytes: layers.reduce(
      (total, layer) =>
        total +
        layer.boundaryTriangleColors.byteLength +
        layer.boundaryTrianglePositions.byteLength +
        layer.featureLineColors.byteLength +
        layer.featureLinePositions.byteLength +
        layer.graphNodeColors.byteLength +
        layer.graphNodePositions.byteLength +
        layer.regionOverlapMarkerPositions.byteLength +
        layer.regionTriangleColors.byteLength +
        layer.regionTrianglePositions.byteLength,
      0,
    ),
    worldRevision: world.revision,
  }
}

function appendNavigationGraphGeometry(
  world: ZombieEscapeCollisionWorld,
  builders: Array<{
    elevation: number
    graphFeatureColors: number[]
    graphFeatures: number[]
    graphNodeColors: number[]
    graphNodes: number[]
  }>,
) {
  const graph = world.navigationGraph
  const nodeCount = graph.nodeIds.length
  const witnessMarks = new Uint8Array(nodeCount)
  for (const node of graph.targetRegionIndex.witnessNodes) {
    if (node >= 0 && node < nodeCount) witnessMarks[node] = 1
  }

  for (let node = 0; node < nodeCount; node += 1) {
    const layerIndex = graph.layerIndices[node]!
    const builder = builders[layerIndex]
    if (!builder) continue
    const fallbackDegree =
      graph.fallbackAdjacency.nodeOffsets[node + 1]! - graph.fallbackAdjacency.nodeOffsets[node]!
    const connectorNode = graph.connectorIndices[node]! >= 0
    const color =
      fallbackDegree === 0 || (connectorNode && fallbackDegree <= 1)
        ? FEATURE_COLOR.graphOrphan
        : connectorNode
          ? FEATURE_COLOR.graphConnector
          : witnessMarks[node] !== 0
            ? FEATURE_COLOR.graphWitness
            : FEATURE_COLOR.graphNode
    builder.graphNodes.push(
      graph.x[node]!,
      builder.elevation + GRAPH_NODE_SURFACE_OFFSET_METERS,
      graph.z[node]!,
    )
    builder.graphNodeColors.push(...color)
  }

  let strictEdgeCount = 0
  let fallbackOnlyEdgeCount = 0
  const strict = graph.strictAdjacency
  const fallback = graph.fallbackAdjacency
  for (let node = 0; node < nodeCount; node += 1) {
    let strictEdge = strict.nodeOffsets[node]!
    const strictEnd = strict.nodeOffsets[node + 1]!
    let fallbackEdge = fallback.nodeOffsets[node]!
    const fallbackEnd = fallback.nodeOffsets[node + 1]!
    while (strictEdge < strictEnd || fallbackEdge < fallbackEnd) {
      const strictNode =
        strictEdge < strictEnd ? strict.toNodes[strictEdge]! : Number.MAX_SAFE_INTEGER
      const fallbackNode =
        fallbackEdge < fallbackEnd ? fallback.toNodes[fallbackEdge]! : Number.MAX_SAFE_INTEGER
      if (strictNode === fallbackNode) {
        if (
          appendNavigationGraphEdge(world, builders, node, strictNode, FEATURE_COLOR.graphStrict)
        ) {
          strictEdgeCount += 1
        }
        strictEdge += 1
        fallbackEdge += 1
        continue
      }
      if (strictNode < fallbackNode) {
        if (
          appendNavigationGraphEdge(world, builders, node, strictNode, FEATURE_COLOR.graphStrict)
        ) {
          strictEdgeCount += 1
        }
        strictEdge += 1
        continue
      }
      const fallbackColor = fallbackEdgeUsesOnlyInactiveBreaches(world, fallbackEdge)
        ? FEATURE_COLOR.graphFallbackOpen
        : FEATURE_COLOR.graphFallback
      if (appendNavigationGraphEdge(world, builders, node, fallbackNode, fallbackColor)) {
        fallbackOnlyEdgeCount += 1
      }
      fallbackEdge += 1
    }
  }
  return { fallbackOnlyEdgeCount, strictEdgeCount }
}

function appendNavigationGraphEdge(
  world: ZombieEscapeCollisionWorld,
  builders: Array<{
    elevation: number
    graphFeatureColors: number[]
    graphFeatures: number[]
  }>,
  firstNode: number,
  secondNode: number,
  defaultColor: readonly [number, number, number],
) {
  const graph = world.navigationGraph
  if (firstNode >= secondNode || secondNode < 0 || secondNode >= graph.nodeIds.length) {
    return false
  }
  const firstLayerIndex = graph.layerIndices[firstNode]!
  const secondLayerIndex = graph.layerIndices[secondNode]!
  const firstBuilder = builders[firstLayerIndex]
  const secondBuilder = builders[secondLayerIndex]
  if (!firstBuilder || !secondBuilder) return false
  const firstConnector = graph.connectorIndices[firstNode]!
  const secondConnector = graph.connectorIndices[secondNode]!
  const isConnectorEdge =
    firstLayerIndex !== secondLayerIndex ||
    (firstConnector >= 0 &&
      firstConnector === secondConnector &&
      graph.connectorEnds[firstNode] !== graph.connectorEnds[secondNode])
  const color = isConnectorEdge ? FEATURE_COLOR.graphConnector : defaultColor
  const appendToBuilder = (builder: typeof firstBuilder) =>
    appendColoredLine(
      builder.graphFeatures,
      builder.graphFeatureColors,
      graph.x[firstNode]!,
      firstBuilder.elevation + GRAPH_EDGE_SURFACE_OFFSET_METERS,
      graph.z[firstNode]!,
      graph.x[secondNode]!,
      secondBuilder.elevation + GRAPH_EDGE_SURFACE_OFFSET_METERS,
      graph.z[secondNode]!,
      color,
    )
  appendToBuilder(firstBuilder)
  if (firstLayerIndex !== secondLayerIndex) appendToBuilder(secondBuilder)
  return true
}

function fallbackEdgeUsesOnlyInactiveBreaches(world: ZombieEscapeCollisionWorld, edge: number) {
  const adjacency = world.navigationGraph.fallbackAdjacency
  let hasKnownBreach = false
  for (
    let offset = adjacency.breachObjectOffsets[edge]!;
    offset < adjacency.breachObjectOffsets[edge + 1]!;
    offset += 1
  ) {
    const breachIndex = adjacency.breachObjectIndices[offset]!
    const objectOrdinal = world.navigationGraph.breachObjectOrdinals[breachIndex] ?? -1
    if (objectOrdinal < 0 || objectOrdinal >= world.activeObjectMask.length) continue
    hasKnownBreach = true
    if (world.activeObjectMask[objectOrdinal] !== 0) return false
  }
  return hasKnownBreach
}

export function createZombieEscapeNavigationDebugRouteSnapshot(
  field: ZombieEscapeFlowField,
): ZombieEscapeNavigationDebugRouteSnapshot {
  const world = field.world
  const bank = inspectZombieEscapeSparseReverseFieldBanks(field)
  const generation = getZombieEscapeSparseCommittedRouteGeneration(field)
  if (bank.activeGeneration !== generation) {
    throw new Error('Zombie Escape navigation debug route generation is inconsistent')
  }
  if (generation <= 0) {
    return {
      generation: 0,
      layers: world.navigationLayers.map(() => ({
        lineColors: new Float32Array(0),
        linePositions: new Float32Array(0),
        terminalAnchorColors: new Float32Array(0),
        terminalAnchorPositions: new Float32Array(0),
      })),
      routeBytes: 0,
      targetLayerIndex: field.targetLayerIndex,
      worldRevision: world.revision,
    }
  }
  const removalWasAcknowledged =
    field.graphSparseTargetUpdate.status !== 'invalidated' &&
    field.graphSparseTargetUpdate.worldRevision === world.revision
  if (
    (bank.activeWorldRevision !== world.revision && !removalWasAcknowledged) ||
    bank.activeRouteTargetLayerIndex !== field.targetLayerIndex
  ) {
    throw new Error('Zombie Escape navigation debug route bank is not current')
  }
  const graph = world.navigationGraph
  const layerBuilders = world.navigationLayers.map(() => ({
    colors: [] as number[],
    lines: [] as number[],
    terminalAnchors: [] as number[],
    terminalColors: [] as number[],
  }))
  const strictNextNodes = field.graphStrictNextNodes
  const fallbackNextNodes = field.graphFallbackNextNodes
  for (let node = 0; node < graph.nodeIds.length; node += 1) {
    const layerIndex = graph.layerIndices[node]!
    const builder = layerBuilders[layerIndex]
    const elevation = world.navigationLayers[layerIndex]?.elevation
    if (!builder || elevation === undefined) continue
    const strictNext = strictNextNodes[node]!
    const fallbackNext = fallbackNextNodes[node]!
    const strictTerminal = field.graphStrictTargetNodeMarks[node] !== 0
    const fallbackTerminal = !strictTerminal && field.graphFallbackTargetNodeMarks[node] !== 0
    if (strictTerminal || (strictNext < 0 && fallbackTerminal)) {
      const color = strictTerminal ? FEATURE_COLOR.routeStrict : FEATURE_COLOR.routeFallback
      builder.terminalAnchors.push(
        graph.x[node]!,
        elevation + ROUTE_SURFACE_OFFSET_METERS,
        graph.z[node]!,
      )
      builder.terminalColors.push(color[0], color[1], color[2])
      continue
    }
    const nextNode = strictNext >= 0 ? strictNext : fallbackNext
    if (nextNode < 0) continue
    if (nextNode >= graph.nodeIds.length) continue
    const nextLayerIndex = graph.layerIndices[nextNode]!
    const nextElevation = world.navigationLayers[nextLayerIndex]?.elevation
    if (nextElevation === undefined) continue
    appendColoredLine(
      builder.lines,
      builder.colors,
      graph.x[node]!,
      elevation + ROUTE_SURFACE_OFFSET_METERS,
      graph.z[node]!,
      graph.x[nextNode]!,
      nextElevation + ROUTE_SURFACE_OFFSET_METERS,
      graph.z[nextNode]!,
      strictNext >= 0 ? FEATURE_COLOR.routeStrict : FEATURE_COLOR.routeFallback,
    )
    appendRouteArrowhead(
      builder.lines,
      builder.colors,
      graph.x[node]!,
      elevation + ROUTE_SURFACE_OFFSET_METERS,
      graph.z[node]!,
      graph.x[nextNode]!,
      nextElevation + ROUTE_SURFACE_OFFSET_METERS,
      graph.z[nextNode]!,
      strictNext >= 0 ? FEATURE_COLOR.routeStrict : FEATURE_COLOR.routeFallback,
    )
  }
  const layers = layerBuilders.map((builder) => ({
    lineColors: Float32Array.from(builder.colors),
    linePositions: Float32Array.from(builder.lines),
    terminalAnchorColors: Float32Array.from(builder.terminalColors),
    terminalAnchorPositions: Float32Array.from(builder.terminalAnchors),
  }))
  return {
    generation,
    layers,
    routeBytes: layers.reduce(
      (total, layer) =>
        total +
        layer.lineColors.byteLength +
        layer.linePositions.byteLength +
        layer.terminalAnchorColors.byteLength +
        layer.terminalAnchorPositions.byteLength,
      0,
    ),
    targetLayerIndex: field.targetLayerIndex,
    worldRevision: world.revision,
  }
}

export function countZombieEscapeNavigationDebugTerminalSegments(
  snapshot: ZombieEscapeNavigationDebugRouteSnapshot,
) {
  return snapshot.layers.reduce(
    (count, layer) => count + (layer.terminalAnchorPositions.length / 3) * 3,
    0,
  )
}

export function updateZombieEscapeNavigationDebugTerminalLinks(
  field: ZombieEscapeFlowField,
  snapshot: ZombieEscapeNavigationDebugRouteSnapshot,
  buffers: ZombieEscapeNavigationDebugLiveBuffers,
  floorSelection: number,
) {
  buffers.terminalLinkCount = 0
  if (
    snapshot.generation !== getZombieEscapeSparseCommittedRouteGeneration(field) ||
    snapshot.worldRevision !== field.world.revision ||
    snapshot.targetLayerIndex !== field.targetLayerIndex
  ) {
    return 0
  }
  const target = resolveZombieEscapeSparseEffectiveCommittedTarget(field)
  if (
    !target.routeTargetInitialized ||
    target.routeTargetLayerIndex !== snapshot.targetLayerIndex
  ) {
    return 0
  }

  const targetY = target.routeTargetY + ROUTE_SURFACE_OFFSET_METERS
  for (let layerIndex = 0; layerIndex < snapshot.layers.length; layerIndex += 1) {
    if (!debugFloorIncludesLayer(floorSelection, layerIndex)) continue
    const layer = snapshot.layers[layerIndex]!
    for (let offset = 0; offset < layer.terminalAnchorPositions.length; offset += 3) {
      const firstX = layer.terminalAnchorPositions[offset]!
      const firstY = layer.terminalAnchorPositions[offset + 1]!
      const firstZ = layer.terminalAnchorPositions[offset + 2]!
      const directionX = target.routeTargetX - firstX
      const directionZ = target.routeTargetZ - firstZ
      const length = Math.hypot(directionX, directionZ)
      if (length <= REGION_AREA_EPSILON) continue
      const unitX = directionX / length
      const unitZ = directionZ / length
      const arrowLength = Math.min(0.24, Math.max(0.08, length * 0.22))
      const wing = arrowLength * 0.52
      const baseX = target.routeTargetX - unitX * arrowLength
      const baseZ = target.routeTargetZ - unitZ * arrowLength
      writeZombieEscapeNavigationDebugLinkSegment(
        buffers,
        firstX,
        firstY,
        firstZ,
        target.routeTargetX,
        targetY,
        target.routeTargetZ,
        layer.terminalAnchorColors[offset]!,
        layer.terminalAnchorColors[offset + 1]!,
        layer.terminalAnchorColors[offset + 2]!,
      )
      writeZombieEscapeNavigationDebugLinkSegment(
        buffers,
        target.routeTargetX,
        targetY,
        target.routeTargetZ,
        baseX - unitZ * wing,
        targetY,
        baseZ + unitX * wing,
        layer.terminalAnchorColors[offset]!,
        layer.terminalAnchorColors[offset + 1]!,
        layer.terminalAnchorColors[offset + 2]!,
      )
      writeZombieEscapeNavigationDebugLinkSegment(
        buffers,
        target.routeTargetX,
        targetY,
        target.routeTargetZ,
        baseX + unitZ * wing,
        targetY,
        baseZ - unitX * wing,
        layer.terminalAnchorColors[offset]!,
        layer.terminalAnchorColors[offset + 1]!,
        layer.terminalAnchorColors[offset + 2]!,
      )
    }
  }
  return buffers.terminalLinkCount
}

function writeZombieEscapeNavigationDebugLinkSegment(
  buffers: ZombieEscapeNavigationDebugLiveBuffers,
  firstX: number,
  firstY: number,
  firstZ: number,
  secondX: number,
  secondY: number,
  secondZ: number,
  colorR: number,
  colorG: number,
  colorB: number,
) {
  const offset = buffers.terminalLinkCount * 6
  if (offset + 6 > buffers.linkPositions.length) {
    throw new Error('Zombie Escape navigation debug terminal link capacity is exhausted')
  }
  buffers.linkPositions[offset] = firstX
  buffers.linkPositions[offset + 1] = firstY
  buffers.linkPositions[offset + 2] = firstZ
  buffers.linkPositions[offset + 3] = secondX
  buffers.linkPositions[offset + 4] = secondY
  buffers.linkPositions[offset + 5] = secondZ
  buffers.linkColors[offset] = colorR
  buffers.linkColors[offset + 1] = colorG
  buffers.linkColors[offset + 2] = colorB
  buffers.linkColors[offset + 3] = colorR
  buffers.linkColors[offset + 4] = colorG
  buffers.linkColors[offset + 5] = colorB
  buffers.terminalLinkCount += 1
}

export function createZombieEscapeNavigationDebugLiveBuffers(
  capacity: number,
  terminalSegmentCapacity = 0,
): ZombieEscapeNavigationDebugLiveBuffers {
  const safeCapacity = Math.max(0, Math.floor(capacity))
  const safeTerminalSegmentCapacity = Math.max(0, Math.floor(terminalSegmentCapacity))
  return {
    activeCount: 0,
    agentColors: new Float32Array(safeCapacity * 3),
    agentPositions: new Float32Array(safeCapacity * 3),
    anomalyCount: 0,
    anomalyPositions: new Float32Array(safeCapacity * 3),
    classificationActivationRevision: -1,
    classificationCollisionWorldGeneration: -1,
    classificationRouteGeneration: -1,
    classificationTargetRevision: -1,
    classifications: Array.from({ length: safeCapacity }, () =>
      createZombieEscapeNavigationAgentInspection(),
    ),
    layerIndices: new Int16Array(safeCapacity).fill(-1),
    linkCount: 0,
    linkColors: new Float32Array((safeCapacity + safeTerminalSegmentCapacity) * 2 * 3),
    linkPositions: new Float32Array((safeCapacity + safeTerminalSegmentCapacity) * 2 * 3),
    overlapCounts: new Uint8Array(safeCapacity),
    slots: new Int16Array(safeCapacity).fill(-1),
    terminalLinkCount: 0,
    visibleIndices: new Int16Array(safeCapacity).fill(-1),
    visibleAnomalyCount: 0,
    visibleCount: 0,
  }
}

export function classifyZombieEscapeNavigationDebugAgents(
  simulation: ZombieEscapeSimulation,
  buffers: ZombieEscapeNavigationDebugLiveBuffers,
) {
  const capacity = Math.min(simulation.zombies.pool.capacity, buffers.classifications.length)
  let activeCount = 0
  let anomalyCount = 0
  for (let slot = 0; slot < capacity; slot += 1) {
    const inspection = buffers.classifications[activeCount]!
    if (!inspectZombieEscapeNavigationAgent(simulation, slot, inspection)) continue
    const overlaps =
      inspection.connectorIndex >= 0 || inspection.layerIndex < 0
        ? 0
        : countZombieEscapeNavigationDebugStrictRegionOverlaps(
            simulation.collisionWorld.navigationGraph.targetRegionIndex,
            inspection.layerIndex,
            simulation.zombies.x[slot]!,
            simulation.zombies.z[slot]!,
          )
    if (overlaps > 1) {
      inspection.anomalyMask |= ZOMBIE_ESCAPE_NAVIGATION_AGENT_ANOMALY.overlappingStrictRegions
    }
    buffers.layerIndices[activeCount] = inspection.layerIndex
    buffers.overlapCounts[activeCount] = Math.min(255, overlaps)
    buffers.slots[activeCount] = slot
    if (inspection.anomalyMask !== 0) anomalyCount += 1
    activeCount += 1
  }
  buffers.activeCount = activeCount
  buffers.anomalyCount = anomalyCount
  buffers.classificationActivationRevision = simulation.collisionWorld.activationRevision
  buffers.classificationCollisionWorldGeneration = simulation.collisionWorldGeneration
  buffers.classificationRouteGeneration = simulation.navigationTargetCommittedRouteGeneration
  buffers.classificationTargetRevision = simulation.navigationTargetRequestedRevision
  return activeCount
}

export function zombieEscapeNavigationDebugClassificationIsCurrent(
  simulation: ZombieEscapeSimulation,
  buffers: ZombieEscapeNavigationDebugLiveBuffers,
) {
  if (
    buffers.classificationActivationRevision !== simulation.collisionWorld.activationRevision ||
    buffers.classificationCollisionWorldGeneration !== simulation.collisionWorldGeneration ||
    buffers.classificationRouteGeneration !== simulation.navigationTargetCommittedRouteGeneration ||
    buffers.classificationTargetRevision !== simulation.navigationTargetRequestedRevision
  ) {
    return false
  }

  const zombies = simulation.zombies
  const capacity = Math.min(zombies.pool.capacity, buffers.classifications.length)
  let activeIndex = 0
  for (let slot = 0; slot < capacity; slot += 1) {
    if (zombies.pool.active[slot] === 0 || zombies.health[slot]! <= 0) continue
    const inspection = buffers.classifications[activeIndex]
    if (
      !inspection ||
      buffers.slots[activeIndex] !== slot ||
      inspection.poolGeneration !== zombies.pool.generation[slot]
    ) {
      return false
    }
    activeIndex += 1
  }
  return activeIndex === buffers.activeCount
}

export function updateZombieEscapeNavigationDebugLiveGeometry(
  simulation: ZombieEscapeSimulation,
  buffers: ZombieEscapeNavigationDebugLiveBuffers,
  floorSelection: number,
) {
  if (!zombieEscapeNavigationDebugClassificationIsCurrent(simulation, buffers)) {
    buffers.linkCount = buffers.terminalLinkCount
    buffers.visibleAnomalyCount = 0
    buffers.visibleCount = 0
    return buffers
  }
  const zombies = simulation.zombies
  let visibleCount = 0
  let anomalyCount = 0
  let linkCount = buffers.terminalLinkCount
  for (let index = 0; index < buffers.activeCount; index += 1) {
    const slot = buffers.slots[index]!
    const inspection = buffers.classifications[index]!
    if (!debugFloorIncludesLayer(floorSelection, inspection.layerIndex)) continue
    const x = zombies.x[slot]!
    const y = zombies.y[slot]!
    const z = zombies.z[slot]!
    const positionOffset = visibleCount * 3
    buffers.visibleIndices[visibleCount] = index
    buffers.agentPositions[positionOffset] = x
    buffers.agentPositions[positionOffset + 1] = y + 0.16
    buffers.agentPositions[positionOffset + 2] = z
    writeActionColor(buffers.agentColors, positionOffset, inspection)
    if (inspection.nextTargetValid) {
      const lineOffset = linkCount * 6
      buffers.linkPositions[lineOffset] = x
      buffers.linkPositions[lineOffset + 1] = y + 0.13
      buffers.linkPositions[lineOffset + 2] = z
      buffers.linkPositions[lineOffset + 3] = inspection.nextTargetX
      buffers.linkPositions[lineOffset + 4] = inspection.nextTargetY + 0.13
      buffers.linkPositions[lineOffset + 5] = inspection.nextTargetZ
      writeActionColor(buffers.linkColors, lineOffset, inspection)
      writeActionColor(buffers.linkColors, lineOffset + 3, inspection)
      linkCount += 1
    }
    if (inspection.anomalyMask !== 0) {
      const anomalyOffset = anomalyCount * 3
      buffers.anomalyPositions[anomalyOffset] = x
      buffers.anomalyPositions[anomalyOffset + 1] = y + 0.34
      buffers.anomalyPositions[anomalyOffset + 2] = z
      anomalyCount += 1
    }
    visibleCount += 1
  }
  buffers.linkCount = linkCount
  buffers.visibleAnomalyCount = anomalyCount
  buffers.visibleCount = visibleCount
  return buffers
}

export function resolveZombieEscapeNavigationDebugPlayerLayer(simulation: ZombieEscapeSimulation) {
  return resolveZombieEscapePinnedNavigationLayerIndex(
    simulation.collisionWorld,
    simulation.player.x,
    simulation.player.z,
    simulation.player.y,
  )
}

export function countZombieEscapeNavigationDebugStrictRegionOverlaps(
  index: ZombieEscapeSparseNavigationTargetRegionIndex,
  layerIndex: number,
  x: number,
  z: number,
) {
  if (
    layerIndex < 0 ||
    layerIndex >= index.layerCount ||
    index.bucketWidth <= 0 ||
    index.bucketHeight <= 0
  ) {
    return 0
  }
  const bucketX = Math.floor(x / index.bucketSize) - index.minimumBucketX
  const bucketZ = Math.floor(z / index.bucketSize) - index.minimumBucketZ
  if (bucketX < 0 || bucketX >= index.bucketWidth || bucketZ < 0 || bucketZ >= index.bucketHeight) {
    return 0
  }
  const cell = (layerIndex * index.bucketHeight + bucketZ) * index.bucketWidth + bucketX
  let count = 0
  for (
    let offset = index.bucketOffsets[cell]!;
    offset < index.bucketOffsets[cell + 1]!;
    offset += 1
  ) {
    const region = index.bucketRegionIndices[offset]!
    if (index.fallbacks[region] !== 0) continue
    if (strictTriangleContainsPoint(index, region, x, z)) count += 1
  }
  return count
}

function appendNavigationRegionGeometry(
  world: ZombieEscapeCollisionWorld,
  builders: Array<{
    boundaries: number[]
    boundaryColors: number[]
    elevation: number
    featureColors: number[]
    features: number[]
    overlapMarkers: number[]
    regions: number[]
    regionColors: number[]
    strictBoundaryVertexCount: number
    strictRegionOverlapMarkerCount: number
    strictRegionVertexCount: number
  }>,
) {
  const index = world.navigationGraph.targetRegionIndex
  for (const fallback of [false, true]) {
    const regionColor = fallback ? FEATURE_COLOR.regionFallback : FEATURE_COLOR.regionStrict
    const boundaryColor = fallback ? FEATURE_COLOR.boundaryFallback : FEATURE_COLOR.boundaryStrict
    const edgeMaps = builders.map(
      () => new Map<string, { count: number; values: readonly number[] }>(),
    )
    for (let region = 0; region < index.layerIndices.length; region += 1) {
      if ((index.fallbacks[region] !== 0) !== fallback) continue
      const layerIndex = index.layerIndices[region]!
      const builder = builders[layerIndex]
      if (!builder || !targetRegionHasPositiveArea(index, region)) continue
      const y = builder.elevation + REGION_SURFACE_OFFSET_METERS
      builder.regions.push(
        index.firstXs[region]!,
        y,
        index.firstZs[region]!,
        index.secondXs[region]!,
        y,
        index.secondZs[region]!,
        index.thirdXs[region]!,
        y,
        index.thirdZs[region]!,
      )
      appendVertexColors(builder.regionColors, 3, regionColor)
      appendCountedTriangleEdge(
        edgeMaps[layerIndex]!,
        index.firstXs[region]!,
        index.firstZs[region]!,
        index.secondXs[region]!,
        index.secondZs[region]!,
      )
      appendCountedTriangleEdge(
        edgeMaps[layerIndex]!,
        index.secondXs[region]!,
        index.secondZs[region]!,
        index.thirdXs[region]!,
        index.thirdZs[region]!,
      )
      appendCountedTriangleEdge(
        edgeMaps[layerIndex]!,
        index.thirdXs[region]!,
        index.thirdZs[region]!,
        index.firstXs[region]!,
        index.firstZs[region]!,
      )
    }
    for (let layerIndex = 0; layerIndex < builders.length; layerIndex += 1) {
      const builder = builders[layerIndex]!
      const y = builder.elevation + BOUNDARY_SURFACE_OFFSET_METERS
      for (const edge of edgeMaps[layerIndex]!.values()) {
        if (edge.count !== 1) continue
        appendBoundaryStrip(
          builder.boundaries,
          builder.boundaryColors,
          edge.values[0]!,
          edge.values[1]!,
          edge.values[2]!,
          edge.values[3]!,
          y,
          boundaryColor,
        )
      }
      if (!fallback) {
        builder.strictRegionVertexCount = builder.regions.length / 3
        builder.strictBoundaryVertexCount = builder.boundaries.length / 3
      }
    }
  }
  appendRegionOverlapMarkers(index, builders)
}

function appendBoundaryStrip(
  positions: number[],
  colors: number[],
  firstX: number,
  firstZ: number,
  secondX: number,
  secondZ: number,
  y: number,
  color: readonly [number, number, number],
) {
  const length = Math.hypot(secondX - firstX, secondZ - firstZ)
  if (length <= REGION_AREA_EPSILON) return
  const offsetX = (-(secondZ - firstZ) / length) * BOUNDARY_STRIP_HALF_WIDTH_METERS
  const offsetZ = ((secondX - firstX) / length) * BOUNDARY_STRIP_HALF_WIDTH_METERS
  const firstLeftX = firstX + offsetX
  const firstLeftZ = firstZ + offsetZ
  const firstRightX = firstX - offsetX
  const firstRightZ = firstZ - offsetZ
  const secondLeftX = secondX + offsetX
  const secondLeftZ = secondZ + offsetZ
  const secondRightX = secondX - offsetX
  const secondRightZ = secondZ - offsetZ
  positions.push(
    firstLeftX,
    y,
    firstLeftZ,
    firstRightX,
    y,
    firstRightZ,
    secondLeftX,
    y,
    secondLeftZ,
    secondLeftX,
    y,
    secondLeftZ,
    firstRightX,
    y,
    firstRightZ,
    secondRightX,
    y,
    secondRightZ,
  )
  appendVertexColors(colors, 6, color)
}

function appendNavigationConnectorGeometry(
  world: ZombieEscapeCollisionWorld,
  builders: Array<{ featureColors: number[]; features: number[] }>,
) {
  for (const connector of world.navigationConnectors) {
    const objectOrdinal = findObjectOrdinal(world, connector.objectId)
    if (objectOrdinal >= 0 && world.activeObjectMask[objectOrdinal] === 0) continue
    const layerIndices =
      connector.startLayerIndex === connector.endLayerIndex
        ? [connector.startLayerIndex]
        : [connector.startLayerIndex, connector.endLayerIndex]
    for (const layerIndex of layerIndices) {
      const builder = builders[layerIndex]
      if (!builder) continue
      appendColoredLine(
        builder.features,
        builder.featureColors,
        connector.startX,
        connector.startY + FEATURE_SURFACE_OFFSET_METERS,
        connector.startZ,
        connector.endX,
        connector.endY + FEATURE_SURFACE_OFFSET_METERS,
        connector.endZ,
        FEATURE_COLOR.connector,
      )
    }
  }
}

function appendRouteArrowhead(
  positions: number[],
  colors: number[],
  firstX: number,
  _firstY: number,
  firstZ: number,
  secondX: number,
  secondY: number,
  secondZ: number,
  color: readonly [number, number, number],
) {
  const directionX = secondX - firstX
  const directionZ = secondZ - firstZ
  const length = Math.hypot(directionX, directionZ)
  if (length <= REGION_AREA_EPSILON) return
  const unitX = directionX / length
  const unitZ = directionZ / length
  const arrowLength = Math.min(0.24, Math.max(0.08, length * 0.22))
  const wing = arrowLength * 0.52
  const baseX = secondX - unitX * arrowLength
  const baseZ = secondZ - unitZ * arrowLength
  appendColoredLine(
    positions,
    colors,
    secondX,
    secondY,
    secondZ,
    baseX - unitZ * wing,
    secondY,
    baseZ + unitX * wing,
    color,
  )
  appendColoredLine(
    positions,
    colors,
    secondX,
    secondY,
    secondZ,
    baseX + unitZ * wing,
    secondY,
    baseZ - unitX * wing,
    color,
  )
}

function appendNavigationDoorLinkGeometry(
  world: ZombieEscapeCollisionWorld,
  builders: Array<{ featureColors: number[]; features: number[] }>,
) {
  const graph = world.navigationGraph
  const adjacency = graph.fallbackAdjacency
  for (let node = 0; node < graph.nodeIds.length; node += 1) {
    for (
      let edge = adjacency.nodeOffsets[node]!;
      edge < adjacency.nodeOffsets[node + 1]!;
      edge += 1
    ) {
      const nextNode = adjacency.toNodes[edge]!
      if (node >= nextNode || !fallbackEdgeBreachesActiveDoor(world, edge)) continue
      const layerIndex = graph.layerIndices[node]!
      const nextLayerIndex = graph.layerIndices[nextNode]!
      if (layerIndex !== nextLayerIndex) continue
      const elevation = world.navigationLayers[layerIndex]?.elevation
      const builder = builders[layerIndex]
      if (!builder || elevation === undefined) continue
      appendColoredLine(
        builder.features,
        builder.featureColors,
        graph.x[node]!,
        elevation + FEATURE_SURFACE_OFFSET_METERS,
        graph.z[node]!,
        graph.x[nextNode]!,
        elevation + FEATURE_SURFACE_OFFSET_METERS,
        graph.z[nextNode]!,
        FEATURE_COLOR.door,
      )
    }
  }
}

function fallbackEdgeBreachesActiveDoor(world: ZombieEscapeCollisionWorld, edge: number) {
  const graph = world.navigationGraph
  const adjacency = graph.fallbackAdjacency
  for (
    let offset = adjacency.breachObjectOffsets[edge]!;
    offset < adjacency.breachObjectOffsets[edge + 1]!;
    offset += 1
  ) {
    const breachIndex = adjacency.breachObjectIndices[offset]!
    const objectOrdinal = graph.breachObjectOrdinals[breachIndex] ?? -1
    if (
      objectOrdinal >= 0 &&
      world.activeObjectMask[objectOrdinal] !== 0 &&
      world.objectCatalog.objectSemanticKinds[objectOrdinal] ===
        ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door
    ) {
      return true
    }
  }
  return false
}

function appendNavigationColliderGeometry(
  world: ZombieEscapeCollisionWorld,
  builders: Array<{ featureColors: number[]; features: number[] }>,
) {
  const colliders: Array<
    ZombieEscapeCollisionSegment | ZombieEscapeCollisionCircle | ZombieEscapeCollisionBox
  > = [...world.segments, ...world.circles, ...world.boxes]
  for (let colliderIndex = 0; colliderIndex < colliders.length; colliderIndex += 1) {
    const collider = colliders[colliderIndex]!
    const objectOrdinal = world.objectCatalog.colliderObjectOrdinals[colliderIndex] ?? -1
    if (objectOrdinal >= 0 && world.activeObjectMask[objectOrdinal] === 0) continue
    const layerIndex = nearestNavigationLayerIndex(world, collider.navigationLayerY)
    const builder = builders[layerIndex]
    if (!builder) continue
    const semanticKind =
      objectOrdinal >= 0
        ? world.objectCatalog.objectSemanticKinds[objectOrdinal]
        : ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.other
    const color =
      semanticKind === ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door
        ? FEATURE_COLOR.blockerDoor
        : semanticKind === ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.furniture
          ? FEATURE_COLOR.blockerFurniture
          : FEATURE_COLOR.blockerOther
    if ('startX' in collider) appendSegmentCollider(builder, collider, color)
    else if ('radius' in collider) appendCircleCollider(builder, collider, color)
    else appendBoxCollider(builder, collider, color)
  }
}

function appendSegmentCollider(
  builder: { featureColors: number[]; features: number[] },
  segment: ZombieEscapeCollisionSegment,
  color: readonly [number, number, number],
) {
  const length = Math.hypot(segment.endX - segment.startX, segment.endZ - segment.startZ)
  if (length <= REGION_AREA_EPSILON) return
  const normalX = (-(segment.endZ - segment.startZ) / length) * segment.halfThickness
  const normalZ = ((segment.endX - segment.startX) / length) * segment.halfThickness
  const y = segment.navigationLayerY + FEATURE_SURFACE_OFFSET_METERS
  const corners = [
    [segment.startX + normalX, segment.startZ + normalZ],
    [segment.endX + normalX, segment.endZ + normalZ],
    [segment.endX - normalX, segment.endZ - normalZ],
    [segment.startX - normalX, segment.startZ - normalZ],
  ] as const
  appendClosedRing(builder, corners, y, color)
}

function appendCircleCollider(
  builder: { featureColors: number[]; features: number[] },
  circle: ZombieEscapeCollisionCircle,
  color: readonly [number, number, number],
) {
  const y = circle.navigationLayerY + FEATURE_SURFACE_OFFSET_METERS
  let previousX = circle.x + circle.radius
  let previousZ = circle.z
  for (let step = 1; step <= CIRCLE_SEGMENT_COUNT; step += 1) {
    const angle = (step / CIRCLE_SEGMENT_COUNT) * Math.PI * 2
    const x = circle.x + Math.cos(angle) * circle.radius
    const z = circle.z + Math.sin(angle) * circle.radius
    appendColoredLine(
      builder.features,
      builder.featureColors,
      previousX,
      y,
      previousZ,
      x,
      y,
      z,
      color,
    )
    previousX = x
    previousZ = z
  }
}

function appendBoxCollider(
  builder: { featureColors: number[]; features: number[] },
  box: ZombieEscapeCollisionBox,
  color: readonly [number, number, number],
) {
  const corners: Array<readonly [number, number]> = []
  for (const [localX, localZ] of [
    [-box.halfWidth, -box.halfDepth],
    [box.halfWidth, -box.halfDepth],
    [box.halfWidth, box.halfDepth],
    [-box.halfWidth, box.halfDepth],
  ] as const) {
    corners.push([
      box.centerX + localX * box.cosine - localZ * box.sine,
      box.centerZ + localX * box.sine + localZ * box.cosine,
    ])
  }
  appendClosedRing(builder, corners, box.navigationLayerY + FEATURE_SURFACE_OFFSET_METERS, color)
}

function appendClosedRing(
  builder: { featureColors: number[]; features: number[] },
  points: readonly (readonly [number, number])[],
  y: number,
  color: readonly [number, number, number],
) {
  for (let index = 0; index < points.length; index += 1) {
    const first = points[index]!
    const second = points[(index + 1) % points.length]!
    appendColoredLine(
      builder.features,
      builder.featureColors,
      first[0],
      y,
      first[1],
      second[0],
      y,
      second[1],
      color,
    )
  }
}

function appendColoredLine(
  positions: number[],
  colors: number[],
  firstX: number,
  firstY: number,
  firstZ: number,
  secondX: number,
  secondY: number,
  secondZ: number,
  color: readonly [number, number, number],
) {
  positions.push(firstX, firstY, firstZ, secondX, secondY, secondZ)
  colors.push(...color, ...color)
}

function appendVertexColors(
  colors: number[],
  vertexCount: number,
  color: readonly [number, number, number],
) {
  for (let vertex = 0; vertex < vertexCount; vertex += 1) colors.push(...color)
}

function appendCountedTriangleEdge(
  edges: Map<string, { count: number; values: readonly number[] }>,
  firstX: number,
  firstZ: number,
  secondX: number,
  secondZ: number,
) {
  const firstPrecedes = firstX < secondX || (firstX === secondX && firstZ <= secondZ)
  const values = firstPrecedes
    ? [firstX, firstZ, secondX, secondZ]
    : [secondX, secondZ, firstX, firstZ]
  const key = `${String(values[0])},${String(values[1])}|${String(values[2])},${String(values[3])}`
  const existing = edges.get(key)
  if (existing) existing.count += 1
  else edges.set(key, { count: 1, values })
}

function targetRegionHasPositiveArea(
  index: ZombieEscapeSparseNavigationTargetRegionIndex,
  region: number,
) {
  return (
    Math.abs(
      (index.secondXs[region]! - index.firstXs[region]!) *
        (index.thirdZs[region]! - index.firstZs[region]!) -
        (index.secondZs[region]! - index.firstZs[region]!) *
          (index.thirdXs[region]! - index.firstXs[region]!),
    ) > REGION_AREA_EPSILON
  )
}

function strictTriangleContainsPoint(
  index: ZombieEscapeSparseNavigationTargetRegionIndex,
  region: number,
  x: number,
  z: number,
) {
  if (!targetRegionHasPositiveArea(index, region)) return false
  const firstCross =
    (index.secondXs[region]! - index.firstXs[region]!) * (z - index.firstZs[region]!) -
    (index.secondZs[region]! - index.firstZs[region]!) * (x - index.firstXs[region]!)
  const secondCross =
    (index.thirdXs[region]! - index.secondXs[region]!) * (z - index.secondZs[region]!) -
    (index.thirdZs[region]! - index.secondZs[region]!) * (x - index.secondXs[region]!)
  const thirdCross =
    (index.firstXs[region]! - index.thirdXs[region]!) * (z - index.thirdZs[region]!) -
    (index.firstZs[region]! - index.thirdZs[region]!) * (x - index.thirdXs[region]!)
  return (
    (firstCross > REGION_AREA_EPSILON &&
      secondCross > REGION_AREA_EPSILON &&
      thirdCross > REGION_AREA_EPSILON) ||
    (firstCross < -REGION_AREA_EPSILON &&
      secondCross < -REGION_AREA_EPSILON &&
      thirdCross < -REGION_AREA_EPSILON)
  )
}

function appendRegionOverlapMarkers(
  index: ZombieEscapeSparseNavigationTargetRegionIndex,
  builders: Array<{
    elevation: number
    overlapMarkers: number[]
    strictRegionOverlapMarkerCount: number
  }>,
) {
  const visitedPairs = new Set<string>()
  const centroid = { x: 0, z: 0 }
  const appendPair = (first: number, second: number) => {
    const minimum = Math.min(first, second)
    const maximum = Math.max(first, second)
    const pairKey = `${String(minimum)}:${String(maximum)}`
    if (visitedPairs.has(pairKey)) return
    visitedPairs.add(pairKey)
    if (!writeTriangleIntersectionCentroid(index, minimum, maximum, centroid)) return
    const layerIndex = index.layerIndices[minimum]!
    const builder = builders[layerIndex]
    if (!builder) return
    builder.overlapMarkers.push(centroid.x, builder.elevation + 0.26, centroid.z)
  }

  for (let cell = 0; cell + 1 < index.bucketOffsets.length; cell += 1) {
    const start = index.bucketOffsets[cell]!
    const end = index.bucketOffsets[cell + 1]!
    for (let firstOffset = start; firstOffset < end; firstOffset += 1) {
      const first = index.bucketRegionIndices[firstOffset]!
      for (let secondOffset = firstOffset + 1; secondOffset < end; secondOffset += 1) {
        appendPair(first, index.bucketRegionIndices[secondOffset]!)
      }
    }
  }
  for (const builder of builders) {
    builder.strictRegionOverlapMarkerCount = builder.overlapMarkers.length / 3
  }

  const fallbackBuckets = new Map<string, number[]>()
  for (let region = 0; region < index.layerIndices.length; region += 1) {
    if (index.fallbacks[region] === 0 || !targetRegionHasPositiveArea(index, region)) continue
    const minimumBucketX = Math.floor(
      Math.min(index.firstXs[region]!, index.secondXs[region]!, index.thirdXs[region]!) /
        index.bucketSize,
    )
    const maximumBucketX = Math.floor(
      Math.max(index.firstXs[region]!, index.secondXs[region]!, index.thirdXs[region]!) /
        index.bucketSize,
    )
    const minimumBucketZ = Math.floor(
      Math.min(index.firstZs[region]!, index.secondZs[region]!, index.thirdZs[region]!) /
        index.bucketSize,
    )
    const maximumBucketZ = Math.floor(
      Math.max(index.firstZs[region]!, index.secondZs[region]!, index.thirdZs[region]!) /
        index.bucketSize,
    )
    for (let bucketZ = minimumBucketZ; bucketZ <= maximumBucketZ; bucketZ += 1) {
      for (let bucketX = minimumBucketX; bucketX <= maximumBucketX; bucketX += 1) {
        const key = `${String(index.layerIndices[region])}:${String(bucketX)}:${String(bucketZ)}`
        const entries = fallbackBuckets.get(key)
        if (entries) entries.push(region)
        else fallbackBuckets.set(key, [region])
      }
    }
  }

  for (const regions of fallbackBuckets.values()) {
    for (let firstOffset = 0; firstOffset < regions.length; firstOffset += 1) {
      const first = regions[firstOffset]!
      for (let secondOffset = firstOffset + 1; secondOffset < regions.length; secondOffset += 1) {
        appendPair(first, regions[secondOffset]!)
      }
    }
  }
}

function writeTriangleIntersectionCentroid(
  index: ZombieEscapeSparseNavigationTargetRegionIndex,
  firstRegion: number,
  secondRegion: number,
  output: { x: number; z: number },
) {
  if (
    index.layerIndices[firstRegion] !== index.layerIndices[secondRegion] ||
    (index.fallbacks[firstRegion] !== 0) !== (index.fallbacks[secondRegion] !== 0)
  ) {
    return false
  }
  let polygon = [
    index.firstXs[firstRegion]!,
    index.firstZs[firstRegion]!,
    index.secondXs[firstRegion]!,
    index.secondZs[firstRegion]!,
    index.thirdXs[firstRegion]!,
    index.thirdZs[firstRegion]!,
  ]
  const clip = [
    index.firstXs[secondRegion]!,
    index.firstZs[secondRegion]!,
    index.secondXs[secondRegion]!,
    index.secondZs[secondRegion]!,
    index.thirdXs[secondRegion]!,
    index.thirdZs[secondRegion]!,
  ]
  const clipOrientation = Math.sign(
    (clip[2]! - clip[0]!) * (clip[5]! - clip[1]!) - (clip[3]! - clip[1]!) * (clip[4]! - clip[0]!),
  )
  if (clipOrientation === 0) return false
  for (let edge = 0; edge < 3 && polygon.length >= 6; edge += 1) {
    const edgeStartX = clip[edge * 2]!
    const edgeStartZ = clip[edge * 2 + 1]!
    const edgeEndX = clip[((edge + 1) % 3) * 2]!
    const edgeEndZ = clip[((edge + 1) % 3) * 2 + 1]!
    const clipped: number[] = []
    const pointCount = polygon.length / 2
    for (let point = 0; point < pointCount; point += 1) {
      const currentX = polygon[point * 2]!
      const currentZ = polygon[point * 2 + 1]!
      const previousOffset = ((point + pointCount - 1) % pointCount) * 2
      const previousX = polygon[previousOffset]!
      const previousZ = polygon[previousOffset + 1]!
      const currentInside =
        triangleClipSide(edgeStartX, edgeStartZ, edgeEndX, edgeEndZ, currentX, currentZ) *
          clipOrientation >=
        -REGION_AREA_EPSILON
      const previousInside =
        triangleClipSide(edgeStartX, edgeStartZ, edgeEndX, edgeEndZ, previousX, previousZ) *
          clipOrientation >=
        -REGION_AREA_EPSILON
      if (currentInside !== previousInside) {
        appendLineIntersection(
          clipped,
          previousX,
          previousZ,
          currentX,
          currentZ,
          edgeStartX,
          edgeStartZ,
          edgeEndX,
          edgeEndZ,
        )
      }
      if (currentInside) clipped.push(currentX, currentZ)
    }
    polygon = clipped
  }
  if (polygon.length < 6) return false
  let twiceArea = 0
  let centroidXTimesArea = 0
  let centroidZTimesArea = 0
  const pointCount = polygon.length / 2
  for (let point = 0; point < pointCount; point += 1) {
    const next = (point + 1) % pointCount
    const x = polygon[point * 2]!
    const z = polygon[point * 2 + 1]!
    const nextX = polygon[next * 2]!
    const nextZ = polygon[next * 2 + 1]!
    const cross = x * nextZ - nextX * z
    twiceArea += cross
    centroidXTimesArea += (x + nextX) * cross
    centroidZTimesArea += (z + nextZ) * cross
  }
  if (Math.abs(twiceArea) <= REGION_AREA_EPSILON * 2) return false
  output.x = centroidXTimesArea / (twiceArea * 3)
  output.z = centroidZTimesArea / (twiceArea * 3)
  return Number.isFinite(output.x) && Number.isFinite(output.z)
}

function triangleClipSide(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  pointX: number,
  pointZ: number,
) {
  return (endX - startX) * (pointZ - startZ) - (endZ - startZ) * (pointX - startX)
}

function appendLineIntersection(
  output: number[],
  firstX: number,
  firstZ: number,
  secondX: number,
  secondZ: number,
  clipStartX: number,
  clipStartZ: number,
  clipEndX: number,
  clipEndZ: number,
) {
  const directionX = secondX - firstX
  const directionZ = secondZ - firstZ
  const clipDirectionX = clipEndX - clipStartX
  const clipDirectionZ = clipEndZ - clipStartZ
  const denominator = clipDirectionX * directionZ - clipDirectionZ * directionX
  if (Math.abs(denominator) <= REGION_AREA_EPSILON) return
  const amount =
    (clipDirectionX * (clipStartZ - firstZ) - clipDirectionZ * (clipStartX - firstX)) / denominator
  output.push(firstX + directionX * amount, firstZ + directionZ * amount)
}

function nearestNavigationLayerIndex(world: ZombieEscapeCollisionWorld, elevation: number) {
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < world.navigationLayers.length; index += 1) {
    const distance = Math.abs(world.navigationLayers[index]!.elevation - elevation)
    if (distance >= bestDistance) continue
    best = index
    bestDistance = distance
  }
  return best
}

function findObjectOrdinal(world: ZombieEscapeCollisionWorld, objectId: string) {
  let minimum = 0
  let maximum = world.objectCatalog.objectIds.length - 1
  while (minimum <= maximum) {
    const middle = (minimum + maximum) >>> 1
    const comparison = world.objectCatalog.objectIds[middle]!.localeCompare(objectId)
    if (comparison === 0) return middle
    if (comparison < 0) minimum = middle + 1
    else maximum = middle - 1
  }
  return -1
}

function debugFloorIncludesLayer(floorSelection: number, layerIndex: number) {
  return (
    floorSelection === ZOMBIE_ESCAPE_NAVIGATION_DEBUG_FLOOR.all || floorSelection === layerIndex
  )
}

function writeActionColor(
  colors: Float32Array,
  offset: number,
  inspection: ZombieEscapeNavigationAgentInspection,
) {
  let color: readonly [number, number, number]
  if (inspection.anomalyMask !== 0) color = [1, 0.12, 0.24]
  else if (inspection.action === 'connector') color = FEATURE_COLOR.connector
  else if (inspection.action === 'attack-obstacle') color = FEATURE_COLOR.furniture
  else if (inspection.action === 'attack-player') color = [1, 0.22, 0.46]
  else if (inspection.fallback) color = FEATURE_COLOR.routeFallback
  else color = FEATURE_COLOR.routeStrict
  colors[offset] = color[0]
  colors[offset + 1] = color[1]
  colors[offset + 2] = color[2]
}

export function countZombieEscapeNavigationDebugActiveAgents(zombies: ZombieEscapeZombiePool) {
  let count = 0
  for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
    if (zombies.pool.active[slot] !== 0 && zombies.health[slot]! > 0) count += 1
  }
  return count
}

export function assertZombieEscapeNavigationDebugColoredGeometryCardinality(
  positions: Float32Array,
  colors: Float32Array,
) {
  if (positions.length % 3 !== 0 || colors.length !== positions.length) {
    throw new Error('Zombie Escape navigation debug colored geometry is malformed')
  }
}

export function resolveZombieEscapeNavigationDebugFeatureDrawRange(
  layer: Pick<
    ZombieEscapeNavigationDebugLayerGeometry,
    'featureLinePositions' | 'graphFeatureLineVertexCount'
  >,
  showFullGraph: boolean,
) {
  const vertexCount = layer.featureLinePositions.length / 3
  const graphVertexCount = Math.max(0, Math.min(vertexCount, layer.graphFeatureLineVertexCount))
  const start = showFullGraph ? 0 : graphVertexCount
  return { count: vertexCount - start, start }
}

export function countZombieEscapeNavigationDebugDraws(
  layers: readonly ZombieEscapeNavigationDebugLayerGeometry[],
  routeLayers: readonly ZombieEscapeNavigationDebugRouteLayerGeometry[],
  selectedFloor: number,
  showFallbackRegions: boolean,
  showFullGraph: boolean,
  visibleAgentCount: number,
  visibleLinkCount: number,
  anomalyCount: number,
) {
  let drawCount = 0
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
    if (
      selectedFloor !== ZOMBIE_ESCAPE_NAVIGATION_DEBUG_FLOOR.all &&
      selectedFloor !== layerIndex
    ) {
      continue
    }
    const layer = layers[layerIndex]!
    const route = routeLayers[layerIndex]
    const regionCount = showFallbackRegions
      ? layer.regionTrianglePositions.length
      : layer.strictRegionVertexCount * 3
    const boundaryCount = showFallbackRegions
      ? layer.boundaryTrianglePositions.length
      : layer.strictBoundaryVertexCount * 3
    if (regionCount > 0) drawCount += 1
    if (boundaryCount > 0) drawCount += 1
    if (resolveZombieEscapeNavigationDebugFeatureDrawRange(layer, showFullGraph).count > 0) {
      drawCount += 1
    }
    if (showFullGraph && layer.graphNodePositions.length > 0) drawCount += 1
    if ((route?.linePositions.length ?? 0) > 0) drawCount += 1
    const overlapCount = showFallbackRegions
      ? layer.regionOverlapMarkerPositions.length
      : layer.strictRegionOverlapMarkerCount * 3
    if (overlapCount > 0) drawCount += 1
  }
  if (visibleAgentCount > 0) drawCount += 1
  if (visibleLinkCount > 0) drawCount += 1
  if (anomalyCount > 0) drawCount += 1
  return drawCount
}
