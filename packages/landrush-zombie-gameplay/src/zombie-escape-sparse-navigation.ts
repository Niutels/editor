import earcut from 'earcut'
import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping'
import {
  ZOMBIE_ESCAPE_COLLISION_EPSILON_METERS as COLLISION_EPSILON_METERS,
  ZOMBIE_ESCAPE_GEOMETRY_EPSILON as INTERSECTION_EPSILON,
} from './zombie-escape-collision-tolerances'
import {
  createZombieEscapeSparseObstacleFootprintUnions,
  type ZombieEscapeSparseObstacleFootprintBox,
  type ZombieEscapeSparseObstacleFootprintCircle,
  type ZombieEscapeSparseObstacleFootprintLayerUnion,
  type ZombieEscapeSparseObstacleFootprintSegment,
} from './zombie-escape-sparse-obstacle-footprints'

const SPARSE_NAVIGATION_ARC_OVERAGE_METERS = 0.008
const SPARSE_NAVIGATION_BUCKET_SIZE_METERS = 4
export const SPARSE_NAVIGATION_SECTOR_COUNT = 8

export type ZombieEscapeSparseNavigationAdjacency = Readonly<{
  breachCounts: Uint32Array
  breachObjectIndices: Uint32Array
  breachObjectOffsets: Uint32Array
  nodeOffsets: Uint32Array
  toNodes: Int32Array
  weights: Float32Array
}>

export type ZombieEscapeSparseNavigationTargetRegionIndex = Readonly<{
  bucketHeight: number
  bucketOffsets: Uint32Array
  bucketRegionIndices: Uint32Array
  bucketSize: number
  bucketWidth: number
  fallbacks: Uint8Array
  firstXs: Float64Array
  firstZs: Float64Array
  layerCount: number
  layerIndices: Int16Array
  maximumBucketRegionCount: number
  minimumBucketX: number
  minimumBucketZ: number
  secondXs: Float64Array
  secondZs: Float64Array
  thirdXs: Float64Array
  thirdZs: Float64Array
  witnessNodes: Int32Array
}>

export type ZombieEscapeSparseNavigationTargetProjection = {
  distanceSquared: number
  regionIndex: number
  x: number
  z: number
}

export type ZombieEscapeSparseNavigationGraph = Readonly<{
  breachObjectCount: number
  breachObjectOrdinals: Uint32Array
  bucketSize: number
  buckets: ReadonlyMap<string, readonly number[]>
  connectorEnds: Uint8Array
  connectorIndices: Int16Array
  fallbackAdjacency: ZombieEscapeSparseNavigationAdjacency
  fallbackComponentIndices: Int32Array
  fallbackSameLayerComponentIndices: Int32Array
  layerIndices: Int16Array
  maximumBucketX: number
  maximumBucketZ: number
  minimumBucketX: number
  minimumBucketZ: number
  nodeIds: readonly string[]
  nodeKeys: readonly string[]
  strictAdjacency: ZombieEscapeSparseNavigationAdjacency
  strictComponentIndices: Int32Array
  strictSameLayerComponentIndices: Int32Array
  supportIndices: Uint32Array
  supportOffsets: Uint32Array
  targetRegionIndex: ZombieEscapeSparseNavigationTargetRegionIndex
  visibilityEvaluationCount: number
  x: Float64Array
  z: Float64Array
}>

type ZombieEscapeSparseNavigationConnector = Readonly<{
  ascendingEnd: boolean
  directionX: number
  directionZ: number
  endX: number
  endY: number
  endZ: number
  length: number
  startX: number
  startY: number
  startZ: number
}>

type ZombieEscapeSparseNavigationSupport = Readonly<{
  elevation: number
  holes?: readonly (readonly Readonly<{ x: number; z: number }>[])[]
  id: string
  polygon: readonly Readonly<{ x: number; z: number }>[]
}>

export type ZombieEscapeSparseNavigationBuildInput = Readonly<{
  agentRadius: number
  boxes: readonly ZombieEscapeSparseObstacleFootprintBox[]
  cellSize: number
  circles: readonly ZombieEscapeSparseObstacleFootprintCircle[]
  navigationConnectorChains: ReadonlyMap<string, readonly number[]>
  navigationConnectors: readonly ZombieEscapeSparseNavigationConnector[]
  navigationLayers: readonly Readonly<{ elevation: number }>[]
  navigationSupports: readonly ZombieEscapeSparseNavigationSupport[]
  segments: readonly ZombieEscapeSparseObstacleFootprintSegment[]
}>

export type ZombieEscapeSparseNavigationCandidatePoint = Readonly<{
  layerIndex: number
  supportIndices: readonly number[]
  x: number
  z: number
}>

export type ZombieEscapeSparseNavigationOracle = Readonly<{
  breachObjectOrdinals: ArrayLike<number>
  candidateIsClear: (
    layerIndex: number,
    x: number,
    z: number,
    breakablesTraversable: boolean,
  ) => boolean
  resolveLayerIndex: (elevation: number) => number
  resolvePairTraversal: (
    first: ZombieEscapeSparseNavigationCandidatePoint,
    second: ZombieEscapeSparseNavigationCandidatePoint,
    output: ZombieEscapeSparseNavigationPairTraversal,
  ) => void
  resolveSupportIndices: (layerIndex: number, x: number, z: number) => readonly number[]
}>

export type ZombieEscapeSparseNavigationPairTraversal = {
  breachObjectIndices: number[]
  visibilityMask: number
}

type SparseNavigationCandidate = Readonly<{
  connectorIndex: number
  connectorTargetEnd: boolean
  id: string
  layerIndex: number
  supportIndices: readonly number[]
  terminalWitness: boolean
  visibilitySectorMask: number
  x: number
  z: number
}>

type SparseNavigationEdge = Readonly<{
  breachObjectIndices: readonly number[]
  first: number
  second: number
  weight: number
}>

type SparseNavigationAuthoredEdge = Readonly<{
  firstId: string
  secondId: string
  visibilityMask: number
}>

type SparseNavigationTriangleWitness = Readonly<{
  first: SparseNavigationTriangulationPoint
  second: SparseNavigationTriangulationPoint
  third: SparseNavigationTriangulationPoint
  x: number
  z: number
}>

type SparseNavigationTargetRegion = Readonly<{
  fallback: boolean
  layerIndex: number
  triangle: SparseNavigationTriangleWitness
  witnessId: string
}>

type SparseNavigationTriangulationPoint = Readonly<{
  x: number
  z: number
}>

type SparseNavigationTriangulation = Readonly<{
  adjacency: readonly Readonly<{ first: number; second: number }>[]
  witnesses: readonly SparseNavigationTriangleWitness[]
}>

export function createEmptyZombieEscapeSparseNavigationGraph(): ZombieEscapeSparseNavigationGraph {
  const emptyAdjacency = {
    breachCounts: new Uint32Array(0),
    breachObjectIndices: new Uint32Array(0),
    breachObjectOffsets: new Uint32Array(1),
    nodeOffsets: new Uint32Array(1),
    toNodes: new Int32Array(0),
    weights: new Float32Array(0),
  }
  return {
    breachObjectCount: 0,
    breachObjectOrdinals: new Uint32Array(0),
    bucketSize: SPARSE_NAVIGATION_BUCKET_SIZE_METERS,
    buckets: new Map(),
    connectorEnds: new Uint8Array(0),
    connectorIndices: new Int16Array(0),
    fallbackAdjacency: emptyAdjacency,
    fallbackComponentIndices: new Int32Array(0),
    fallbackSameLayerComponentIndices: new Int32Array(0),
    layerIndices: new Int16Array(0),
    maximumBucketX: 0,
    maximumBucketZ: 0,
    minimumBucketX: 0,
    minimumBucketZ: 0,
    nodeIds: [],
    nodeKeys: [],
    strictAdjacency: emptyAdjacency,
    strictComponentIndices: new Int32Array(0),
    strictSameLayerComponentIndices: new Int32Array(0),
    supportIndices: new Uint32Array(0),
    supportOffsets: new Uint32Array(1),
    targetRegionIndex: createSparseNavigationTargetRegionIndex([], new Map()),
    visibilityEvaluationCount: 0,
    x: new Float64Array(0),
    z: new Float64Array(0),
  }
}

export function createZombieEscapeSparseNavigationGraph(
  world: ZombieEscapeSparseNavigationBuildInput,
  oracle: ZombieEscapeSparseNavigationOracle,
): ZombieEscapeSparseNavigationGraph {
  const rawCandidates: SparseNavigationCandidate[] = []
  const boundaryEdges: Array<Readonly<{ firstId: string; secondId: string }>> = []
  const connectorEdges: Array<Readonly<{ firstId: string; secondId: string; weight: number }>> = []
  const authoredEdges: SparseNavigationAuthoredEdge[] = []
  const targetRegions: SparseNavigationTargetRegion[] = []
  const fallbackObstacleUnions = createSparseNavigationObstacleUnions(world, true)
  const strictObstacleUnions = createSparseNavigationObstacleUnions(world, false)
  appendSparseConnectorCandidates(world, rawCandidates, connectorEdges, oracle)
  appendSparseSupportCandidates(world, rawCandidates, oracle)
  appendSparseObstacleUnionCandidates(
    world,
    rawCandidates,
    boundaryEdges,
    oracle,
    fallbackObstacleUnions,
  )
  appendSparseFreeSpaceComponentAnchors(
    world,
    rawCandidates,
    oracle,
    strictObstacleUnions,
    authoredEdges,
    targetRegions,
    false,
  )
  appendSparseFreeSpaceComponentAnchors(
    world,
    rawCandidates,
    oracle,
    fallbackObstacleUnions,
    authoredEdges,
    targetRegions,
    true,
  )
  rawCandidates.sort(
    (first, second) =>
      first.layerIndex - second.layerIndex ||
      first.id.localeCompare(second.id) ||
      first.x - second.x ||
      first.z - second.z,
  )
  const candidates: SparseNavigationCandidate[] = []
  const candidateNodesByKey = new Map<string, number>()
  const nodeById = new Map<string, number>()
  for (const candidate of rawCandidates) {
    const key = sparseNavigationCandidateNodeKey(candidate)
    let node = candidateNodesByKey.get(key)
    if (node === undefined) {
      node = candidates.length
      candidateNodesByKey.set(key, node)
      candidates.push(candidate)
    } else if (candidates[node]!.terminalWitness && !candidate.terminalWitness) {
      candidates[node] = { ...candidates[node]!, terminalWitness: false }
    }
    nodeById.set(candidate.id, node)
  }

  const nodeIds = candidates.map(({ id }) => id)
  const nodeKeys = candidates.map(sparseNavigationCandidateNodeKey)
  const x = new Float64Array(candidates.map((candidate) => candidate.x))
  const z = new Float64Array(candidates.map((candidate) => candidate.z))
  const layerIndices = new Int16Array(candidates.map((candidate) => candidate.layerIndex))
  const connectorIndices = new Int16Array(candidates.length).fill(-1)
  const connectorEnds = new Uint8Array(candidates.length)
  const supportOffsets = new Uint32Array(candidates.length + 1)
  for (let node = 0; node < candidates.length; node += 1) {
    connectorIndices[node] = candidates[node]!.connectorIndex
    connectorEnds[node] = candidates[node]!.connectorTargetEnd ? 1 : 0
    supportOffsets[node + 1] = supportOffsets[node]! + candidates[node]!.supportIndices.length
  }
  const supportIndices = new Uint32Array(supportOffsets[candidates.length] ?? 0)
  for (let node = 0; node < candidates.length; node += 1) {
    supportIndices.set(candidates[node]!.supportIndices, supportOffsets[node])
  }
  const bucketIndex = createSparseNavigationCandidateBucketIndex(candidates)
  const targetRegionIndex = createSparseNavigationTargetRegionIndex(targetRegions, nodeById)

  const strictEdges: SparseNavigationEdge[] = []
  const fallbackEdges: SparseNavigationEdge[] = []
  const strictEdgeKeys = new Set<string>()
  const fallbackEdgeKeys = new Set<string>()
  const visibilityEvaluation = { count: 0 }
  const pairTraversal: ZombieEscapeSparseNavigationPairTraversal = {
    breachObjectIndices: [],
    visibilityMask: 0,
  }
  for (const edge of boundaryEdges) {
    const first = nodeById.get(edge.firstId)
    const second = nodeById.get(edge.secondId)
    if (first === undefined || second === undefined) continue
    const traversal = resolveSparseNavigationPairTraversalTracked(
      oracle,
      candidates,
      first,
      second,
      visibilityEvaluation,
      pairTraversal,
    )
    const weight = Math.hypot(x[second]! - x[first]!, z[second]! - z[first]!)
    if ((traversal.visibilityMask & 1) !== 0) {
      appendSparseNavigationEdge(strictEdges, strictEdgeKeys, first, second, weight, [])
    }
    if ((traversal.visibilityMask & 2) !== 0) {
      appendSparseNavigationEdge(
        fallbackEdges,
        fallbackEdgeKeys,
        first,
        second,
        weight,
        traversal.breachObjectIndices,
      )
    }
  }
  for (let node = 0; node < candidates.length; node += 1) {
    if (candidates[node]!.terminalWitness) continue
    const requiredMask = candidates[node]!.visibilitySectorMask
    if (requiredMask === 0) continue
    const bestFallbackNodes = new Int32Array(SPARSE_NAVIGATION_SECTOR_COUNT).fill(-1)
    const bestFallbackBreachObjectIndices: Array<readonly number[]> = Array.from(
      { length: SPARSE_NAVIGATION_SECTOR_COUNT },
      () => [],
    )
    const bestFallbackWeights = new Float64Array(SPARSE_NAVIGATION_SECTOR_COUNT)
    const bestStrictNodes = new Int32Array(SPARSE_NAVIGATION_SECTOR_COUNT).fill(-1)
    const bestStrictWeights = new Float64Array(SPARSE_NAVIGATION_SECTOR_COUNT)
    bestFallbackWeights.fill(Number.POSITIVE_INFINITY)
    bestStrictWeights.fill(Number.POSITIVE_INFINITY)
    let fallbackFoundMask = 0
    let strictFoundMask = 0
    let ring = 0
    for (const neighbors of iterateSparseNavigationCandidateBucketRings(
      candidates,
      bucketIndex,
      node,
    )) {
      for (const neighbor of neighbors) {
        if (candidates[neighbor.index]!.terminalWitness) continue
        const sector = sparseNavigationCandidateSector(
          candidates[node]!,
          candidates[neighbor.index]!,
        )
        const sectorBit = 1 << sector
        if ((requiredMask & sectorBit) === 0) continue
        const weight = Math.sqrt(neighbor.distanceSquared)
        if (
          weight >= bestFallbackWeights[sector]! - INTERSECTION_EPSILON &&
          weight >= bestStrictWeights[sector]! - INTERSECTION_EPSILON
        ) {
          continue
        }
        const traversal = resolveSparseNavigationPairTraversalTracked(
          oracle,
          candidates,
          node,
          neighbor.index,
          visibilityEvaluation,
          pairTraversal,
        )
        if (
          (traversal.visibilityMask & 1) !== 0 &&
          weight < bestStrictWeights[sector]! - INTERSECTION_EPSILON
        ) {
          bestStrictNodes[sector] = neighbor.index
          bestStrictWeights[sector] = weight
          strictFoundMask |= sectorBit
        }
        if (
          (traversal.visibilityMask & 2) !== 0 &&
          weight < bestFallbackWeights[sector]! - INTERSECTION_EPSILON
        ) {
          bestFallbackNodes[sector] = neighbor.index
          bestFallbackBreachObjectIndices[sector] = [...traversal.breachObjectIndices]
          bestFallbackWeights[sector] = weight
          fallbackFoundMask |= sectorBit
        }
      }
      if (
        (fallbackFoundMask & requiredMask) === requiredMask &&
        (strictFoundMask & requiredMask) === requiredMask
      ) {
        let maximumBestWeight = 0
        for (let sector = 0; sector < SPARSE_NAVIGATION_SECTOR_COUNT; sector += 1) {
          if ((requiredMask & (1 << sector)) === 0) continue
          maximumBestWeight = Math.max(
            maximumBestWeight,
            bestFallbackWeights[sector]!,
            bestStrictWeights[sector]!,
          )
        }
        if (
          sparseNavigationMinimumUnvisitedBucketDistance(candidates[node]!, ring) >=
          maximumBestWeight - INTERSECTION_EPSILON
        ) {
          break
        }
      }
      ring += 1
    }
    for (let sector = 0; sector < SPARSE_NAVIGATION_SECTOR_COUNT; sector += 1) {
      const fallbackNeighbor = bestFallbackNodes[sector]!
      if (fallbackNeighbor >= 0) {
        appendSparseNavigationEdge(
          fallbackEdges,
          fallbackEdgeKeys,
          node,
          fallbackNeighbor,
          bestFallbackWeights[sector]!,
          bestFallbackBreachObjectIndices[sector]!,
        )
      }
      const strictNeighbor = bestStrictNodes[sector]!
      if (strictNeighbor >= 0) {
        appendSparseNavigationEdge(
          strictEdges,
          strictEdgeKeys,
          node,
          strictNeighbor,
          bestStrictWeights[sector]!,
          [],
        )
      }
    }
  }
  for (const edge of connectorEdges) {
    const first = nodeById.get(edge.firstId)
    const second = nodeById.get(edge.secondId)
    if (first === undefined || second === undefined) continue
    appendSparseNavigationEdge(strictEdges, strictEdgeKeys, first, second, edge.weight, [])
    appendSparseNavigationEdge(fallbackEdges, fallbackEdgeKeys, first, second, edge.weight, [])
  }
  for (const edge of authoredEdges) {
    const first = nodeById.get(edge.firstId)
    const second = nodeById.get(edge.secondId)
    if (first === undefined || second === undefined) continue
    const traversal = resolveSparseNavigationPairTraversalTracked(
      oracle,
      candidates,
      first,
      second,
      visibilityEvaluation,
      pairTraversal,
    )
    const weight = Math.hypot(x[second]! - x[first]!, z[second]! - z[first]!)
    if ((edge.visibilityMask & traversal.visibilityMask & 1) !== 0) {
      appendSparseNavigationEdge(strictEdges, strictEdgeKeys, first, second, weight, [])
    }
    if ((edge.visibilityMask & traversal.visibilityMask & 2) !== 0) {
      appendSparseNavigationEdge(
        fallbackEdges,
        fallbackEdgeKeys,
        first,
        second,
        weight,
        traversal.breachObjectIndices,
      )
    }
  }
  completeSparseNavigationConnectivity(
    world,
    candidates,
    bucketIndex,
    strictEdges,
    strictEdgeKeys,
    oracle,
    visibilityEvaluation,
    1,
    pairTraversal,
  )
  for (const edge of strictEdges) {
    appendSparseNavigationEdge(
      fallbackEdges,
      fallbackEdgeKeys,
      edge.first,
      edge.second,
      edge.weight,
      [],
    )
  }
  completeSparseNavigationConnectivity(
    world,
    candidates,
    bucketIndex,
    fallbackEdges,
    fallbackEdgeKeys,
    oracle,
    visibilityEvaluation,
    2,
    pairTraversal,
  )

  const fallbackAdjacency = createSparseNavigationAdjacency(candidates.length, fallbackEdges)
  const strictAdjacency = createSparseNavigationAdjacency(candidates.length, strictEdges)
  const breachObjectCount = Math.max(
    sparseNavigationAdjacencyBreachObjectCount(strictAdjacency),
    sparseNavigationAdjacencyBreachObjectCount(fallbackAdjacency),
  )
  if (oracle.breachObjectOrdinals.length < breachObjectCount) {
    throw new Error('Zombie Escape sparse traversal references an unknown breakable object')
  }
  return {
    breachObjectCount,
    breachObjectOrdinals: Uint32Array.from(oracle.breachObjectOrdinals).slice(0, breachObjectCount),
    bucketSize: SPARSE_NAVIGATION_BUCKET_SIZE_METERS,
    buckets: bucketIndex.buckets,
    connectorEnds,
    connectorIndices,
    fallbackAdjacency,
    fallbackComponentIndices: createSparseNavigationComponentIndices(fallbackAdjacency),
    fallbackSameLayerComponentIndices: createSparseNavigationComponentIndices(
      fallbackAdjacency,
      layerIndices,
    ),
    layerIndices,
    maximumBucketX: bucketIndex.maximumBucketX,
    maximumBucketZ: bucketIndex.maximumBucketZ,
    minimumBucketX: bucketIndex.minimumBucketX,
    minimumBucketZ: bucketIndex.minimumBucketZ,
    nodeIds,
    nodeKeys,
    strictAdjacency,
    strictComponentIndices: createSparseNavigationComponentIndices(strictAdjacency),
    strictSameLayerComponentIndices: createSparseNavigationComponentIndices(
      strictAdjacency,
      layerIndices,
    ),
    supportIndices,
    supportOffsets,
    targetRegionIndex,
    visibilityEvaluationCount: visibilityEvaluation.count,
    x,
    z,
  }
}

function sparseNavigationCandidateNodeKey(candidate: SparseNavigationCandidate) {
  return candidate.connectorIndex >= 0
    ? `connector:${candidate.id}`
    : `${String(candidate.layerIndex)}:${candidate.x.toFixed(3)}:${candidate.z.toFixed(3)}`
}

function completeSparseNavigationConnectivity(
  world: ZombieEscapeSparseNavigationBuildInput,
  candidates: readonly SparseNavigationCandidate[],
  bucketIndex: SparseNavigationCandidateBucketIndex,
  edges: SparseNavigationEdge[],
  edgeKeys: Set<string>,
  oracle: ZombieEscapeSparseNavigationOracle,
  visibilityEvaluation: { count: number },
  visibilityMask: number,
  pairTraversal: ZombieEscapeSparseNavigationPairTraversal,
) {
  const parents = new Int32Array(candidates.length)
  const ranks = new Uint8Array(candidates.length)
  for (let node = 0; node < candidates.length; node += 1) parents[node] = node
  for (const edge of edges) {
    if (candidates[edge.first]!.layerIndex !== candidates[edge.second]!.layerIndex) continue
    unionSparseNavigationComponents(parents, ranks, edge.first, edge.second)
  }

  while (true) {
    const seenRoots = new Uint8Array(candidates.length)
    const componentCountsBySupport = new Int32Array(world.navigationSupports.length)
    for (let node = 0; node < candidates.length; node += 1) {
      const root = findSparseNavigationComponent(parents, node)
      if (seenRoots[root] !== 0) continue
      seenRoots[root] = 1
      const supportIndex = candidates[node]!.supportIndices[0]
      if (supportIndex !== undefined) componentCountsBySupport[supportIndex]! += 1
    }
    if (componentCountsBySupport.every((count) => count <= 1)) return

    const bestFirst = new Int32Array(candidates.length).fill(-1)
    const bestSecond = new Int32Array(candidates.length).fill(-1)
    const bestBreachObjectIndices: Array<readonly number[]> = Array.from(
      { length: candidates.length },
      () => [],
    )
    const bestWeight = new Float64Array(candidates.length)
    bestWeight.fill(Number.POSITIVE_INFINITY)
    for (let node = 0; node < candidates.length; node += 1) {
      const source = candidates[node]!
      if (source.terminalWitness) continue
      const sourceSupportIndex = source.supportIndices[0]
      if (sourceSupportIndex === undefined || componentCountsBySupport[sourceSupportIndex]! <= 1) {
        continue
      }
      const sourceRoot = findSparseNavigationComponent(parents, node)
      let ring = 0
      for (const neighbors of iterateSparseNavigationCandidateBucketRings(
        candidates,
        bucketIndex,
        node,
      )) {
        for (const neighbor of neighbors) {
          const neighborNode = neighbor.index
          if (
            candidates[neighborNode]!.terminalWitness ||
            candidates[neighborNode]!.layerIndex !== source.layerIndex ||
            !sparseNavigationCandidatesHaveCommonSupport(source, candidates[neighborNode]!) ||
            findSparseNavigationComponent(parents, neighborNode) === sourceRoot
          ) {
            continue
          }
          const weight = Math.sqrt(neighbor.distanceSquared)
          if (
            weight > bestWeight[sourceRoot]! + INTERSECTION_EPSILON ||
            (Math.abs(weight - bestWeight[sourceRoot]!) <= INTERSECTION_EPSILON &&
              !sparseNavigationBridgePrecedes(
                node,
                neighborNode,
                bestFirst[sourceRoot]!,
                bestSecond[sourceRoot]!,
              ))
          ) {
            continue
          }
          const traversal = resolveSparseNavigationPairTraversalTracked(
            oracle,
            candidates,
            node,
            neighborNode,
            visibilityEvaluation,
            pairTraversal,
          )
          if ((traversal.visibilityMask & visibilityMask) === 0) continue
          bestFirst[sourceRoot] = node
          bestSecond[sourceRoot] = neighborNode
          bestBreachObjectIndices[sourceRoot] =
            visibilityMask === 2 ? [...traversal.breachObjectIndices] : []
          bestWeight[sourceRoot] = weight
        }
        if (
          sparseNavigationMinimumUnvisitedBucketDistance(source, ring) >=
          bestWeight[sourceRoot]! - INTERSECTION_EPSILON
        ) {
          break
        }
        ring += 1
      }
    }

    let merged = false
    for (let root = 0; root < candidates.length; root += 1) {
      const first = bestFirst[root]!
      const second = bestSecond[root]!
      if (first < 0 || second < 0) continue
      if (!unionSparseNavigationComponents(parents, ranks, first, second)) continue
      appendSparseNavigationEdge(
        edges,
        edgeKeys,
        first,
        second,
        bestWeight[root]!,
        bestBreachObjectIndices[root]!,
      )
      merged = true
    }
    if (!merged) return
  }
}

function sparseNavigationCandidatesHaveCommonSupport(
  first: SparseNavigationCandidate,
  second: SparseNavigationCandidate,
) {
  let firstIndex = 0
  let secondIndex = 0
  while (firstIndex < first.supportIndices.length && secondIndex < second.supportIndices.length) {
    const firstSupport = first.supportIndices[firstIndex]!
    const secondSupport = second.supportIndices[secondIndex]!
    if (firstSupport === secondSupport) return true
    if (firstSupport < secondSupport) firstIndex += 1
    else secondIndex += 1
  }
  return false
}

function sparseNavigationBridgePrecedes(
  first: number,
  second: number,
  currentFirst: number,
  currentSecond: number,
) {
  if (currentFirst < 0 || currentSecond < 0) return true
  const minimum = Math.min(first, second)
  const maximum = Math.max(first, second)
  const currentMinimum = Math.min(currentFirst, currentSecond)
  const currentMaximum = Math.max(currentFirst, currentSecond)
  return minimum < currentMinimum || (minimum === currentMinimum && maximum < currentMaximum)
}

function findSparseNavigationComponent(parents: Int32Array, node: number) {
  let root = node
  while (parents[root] !== root) root = parents[root]!
  while (parents[node] !== node) {
    const next = parents[node]!
    parents[node] = root
    node = next
  }
  return root
}

function unionSparseNavigationComponents(
  parents: Int32Array,
  ranks: Uint8Array,
  first: number,
  second: number,
) {
  let firstRoot = findSparseNavigationComponent(parents, first)
  let secondRoot = findSparseNavigationComponent(parents, second)
  if (firstRoot === secondRoot) return false
  if (ranks[firstRoot]! < ranks[secondRoot]!) {
    const swap = firstRoot
    firstRoot = secondRoot
    secondRoot = swap
  }
  parents[secondRoot] = firstRoot
  if (ranks[firstRoot] === ranks[secondRoot]) ranks[firstRoot]! += 1
  return true
}

function sparseNavigationMinimumUnvisitedBucketDistance(
  source: SparseNavigationCandidate,
  completedRing: number,
) {
  const sourceBucketX = Math.floor(source.x / SPARSE_NAVIGATION_BUCKET_SIZE_METERS)
  const sourceBucketZ = Math.floor(source.z / SPARSE_NAVIGATION_BUCKET_SIZE_METERS)
  return sparseNavigationMinimumUnvisitedDistance(
    source.x,
    source.z,
    sourceBucketX,
    sourceBucketZ,
    completedRing,
    SPARSE_NAVIGATION_BUCKET_SIZE_METERS,
  )
}

export function sparseNavigationMinimumUnvisitedDistance(
  sourceX: number,
  sourceZ: number,
  sourceBucketX: number,
  sourceBucketZ: number,
  completedRing: number,
  bucketSize: number,
) {
  const minimumX = (sourceBucketX - completedRing) * bucketSize
  const maximumX = (sourceBucketX + completedRing + 1) * bucketSize
  const minimumZ = (sourceBucketZ - completedRing) * bucketSize
  const maximumZ = (sourceBucketZ + completedRing + 1) * bucketSize
  return Math.min(sourceX - minimumX, maximumX - sourceX, sourceZ - minimumZ, maximumZ - sourceZ)
}

function resolveSparseNavigationPairTraversalTracked(
  oracle: ZombieEscapeSparseNavigationOracle,
  candidates: readonly SparseNavigationCandidate[],
  firstNode: number,
  secondNode: number,
  visibilityEvaluation: { count: number },
  output: ZombieEscapeSparseNavigationPairTraversal,
) {
  visibilityEvaluation.count += 1
  output.breachObjectIndices.length = 0
  output.visibilityMask = 0
  oracle.resolvePairTraversal(candidates[firstNode]!, candidates[secondNode]!, output)
  output.breachObjectIndices.sort((first, second) => first - second)
  for (let index = output.breachObjectIndices.length - 1; index > 0; index -= 1) {
    if (output.breachObjectIndices[index] === output.breachObjectIndices[index - 1]) {
      output.breachObjectIndices.splice(index, 1)
    }
  }
  output.visibilityMask &= 3
  return output
}

function sparseNavigationCandidateSector(
  source: SparseNavigationCandidate,
  target: SparseNavigationCandidate,
) {
  return sparseNavigationDirectionSector(target.x - source.x, target.z - source.z)
}

export function sparseNavigationDirectionSector(directionX: number, directionZ: number) {
  const normalizedAngle = (Math.atan2(directionZ, directionX) + Math.PI) / (Math.PI * 2)
  return Math.min(
    SPARSE_NAVIGATION_SECTOR_COUNT - 1,
    Math.floor(normalizedAngle * SPARSE_NAVIGATION_SECTOR_COUNT),
  )
}

function sparseNavigationOutwardSectorMask(outwardX: number, outwardZ: number) {
  const angle = Math.atan2(outwardZ, outwardX)
  const normalizedAngle = (angle + Math.PI) / (Math.PI * 2)
  const sector = Math.min(
    SPARSE_NAVIGATION_SECTOR_COUNT - 1,
    Math.floor(normalizedAngle * SPARSE_NAVIGATION_SECTOR_COUNT),
  )
  return 1 << sector
}

type SparseNavigationCandidateBucketIndex = Readonly<{
  buckets: ReadonlyMap<string, readonly number[]>
  maximumBucketX: number
  maximumBucketZ: number
  minimumBucketX: number
  minimumBucketZ: number
}>

function createSparseNavigationCandidateBucketIndex(
  candidates: readonly SparseNavigationCandidate[],
): SparseNavigationCandidateBucketIndex {
  const buckets = new Map<string, number[]>()
  let minimumBucketX = Number.POSITIVE_INFINITY
  let minimumBucketZ = Number.POSITIVE_INFINITY
  let maximumBucketX = Number.NEGATIVE_INFINITY
  let maximumBucketZ = Number.NEGATIVE_INFINITY
  for (let node = 0; node < candidates.length; node += 1) {
    const candidate = candidates[node]!
    const bucketX = Math.floor(candidate.x / SPARSE_NAVIGATION_BUCKET_SIZE_METERS)
    const bucketZ = Math.floor(candidate.z / SPARSE_NAVIGATION_BUCKET_SIZE_METERS)
    const key = sparseNavigationBucketKey(candidate.layerIndex, bucketX, bucketZ)
    const nodes = buckets.get(key)
    if (nodes) nodes.push(node)
    else buckets.set(key, [node])
    minimumBucketX = Math.min(minimumBucketX, bucketX)
    minimumBucketZ = Math.min(minimumBucketZ, bucketZ)
    maximumBucketX = Math.max(maximumBucketX, bucketX)
    maximumBucketZ = Math.max(maximumBucketZ, bucketZ)
  }
  return {
    buckets,
    maximumBucketX: Number.isFinite(maximumBucketX) ? maximumBucketX : 0,
    maximumBucketZ: Number.isFinite(maximumBucketZ) ? maximumBucketZ : 0,
    minimumBucketX: Number.isFinite(minimumBucketX) ? minimumBucketX : 0,
    minimumBucketZ: Number.isFinite(minimumBucketZ) ? minimumBucketZ : 0,
  }
}

function* iterateSparseNavigationCandidateBucketRings(
  candidates: readonly SparseNavigationCandidate[],
  bucketIndex: SparseNavigationCandidateBucketIndex,
  sourceNode: number,
) {
  const source = candidates[sourceNode]!
  const sourceBucketX = Math.floor(source.x / SPARSE_NAVIGATION_BUCKET_SIZE_METERS)
  const sourceBucketZ = Math.floor(source.z / SPARSE_NAVIGATION_BUCKET_SIZE_METERS)
  const maximumRing = Math.max(
    Math.abs(sourceBucketX - bucketIndex.minimumBucketX),
    Math.abs(sourceBucketX - bucketIndex.maximumBucketX),
    Math.abs(sourceBucketZ - bucketIndex.minimumBucketZ),
    Math.abs(sourceBucketZ - bucketIndex.maximumBucketZ),
  )
  for (let ring = 0; ring <= maximumRing; ring += 1) {
    const neighbors: Array<Readonly<{ distanceSquared: number; index: number }>> = []
    for (let bucketZ = sourceBucketZ - ring; bucketZ <= sourceBucketZ + ring; bucketZ += 1) {
      for (let bucketX = sourceBucketX - ring; bucketX <= sourceBucketX + ring; bucketX += 1) {
        if (
          Math.max(Math.abs(bucketX - sourceBucketX), Math.abs(bucketZ - sourceBucketZ)) !== ring
        ) {
          continue
        }
        const nodes = bucketIndex.buckets.get(
          sparseNavigationBucketKey(source.layerIndex, bucketX, bucketZ),
        )
        if (!nodes) continue
        for (const node of nodes) {
          if (node === sourceNode) continue
          const candidate = candidates[node]!
          neighbors.push({
            distanceSquared: (candidate.x - source.x) ** 2 + (candidate.z - source.z) ** 2,
            index: node,
          })
        }
      }
    }
    neighbors.sort(
      (first, second) =>
        first.distanceSquared - second.distanceSquared ||
        candidates[first.index]!.id.localeCompare(candidates[second.index]!.id),
    )
    yield neighbors
  }
}

function appendSparseConnectorCandidates(
  world: ZombieEscapeSparseNavigationBuildInput,
  candidates: SparseNavigationCandidate[],
  connectorEdges: Array<Readonly<{ firstId: string; secondId: string; weight: number }>>,
  oracle: ZombieEscapeSparseNavigationOracle,
) {
  const connectorIndicesByChain = world.navigationConnectorChains
  for (const [chainId, indices] of connectorIndicesByChain) {
    const firstIndex = indices[0]
    const lastIndex = indices[indices.length - 1]
    if (firstIndex === undefined || lastIndex === undefined) continue
    const first = world.navigationConnectors[firstIndex]!
    const last = world.navigationConnectors[lastIndex]!
    const lowerTargetEnd = first.ascendingEnd
    const upperTargetEnd = !last.ascendingEnd
    const lower = resolveSparseConnectorLandingCandidate(
      world,
      firstIndex,
      lowerTargetEnd,
      `0:connector:${chainId}:lower`,
      oracle,
    )
    const upper = resolveSparseConnectorLandingCandidate(
      world,
      lastIndex,
      upperTargetEnd,
      `0:connector:${chainId}:upper`,
      oracle,
    )
    if (!(lower && upper)) continue
    candidates.push(lower, upper)
    connectorEdges.push({
      firstId: lower.id,
      secondId: upper.id,
      weight: indices.reduce(
        (total, connectorIndex) =>
          total + (world.navigationConnectors[connectorIndex]?.length ?? 0),
        0,
      ),
    })
  }
}

function resolveSparseConnectorLandingCandidate(
  world: ZombieEscapeSparseNavigationBuildInput,
  connectorIndex: number,
  connectorTargetEnd: boolean,
  id: string,
  oracle: ZombieEscapeSparseNavigationOracle,
) {
  const connector = world.navigationConnectors[connectorIndex]
  if (!connector) return null
  const sourceEnd = !connectorTargetEnd
  const sourceX = sourceEnd ? connector.endX : connector.startX
  const sourceZ = sourceEnd ? connector.endZ : connector.startZ
  const sourceY = sourceEnd ? connector.endY : connector.startY
  const layerIndex = oracle.resolveLayerIndex(sourceY)
  const travelAmount = connectorTargetEnd ? 1 : -1
  for (let step = -1; step < 8; step += 1) {
    const clearance = step < 0 ? 0 : world.agentRadius + world.cellSize * (1 + step)
    const x = sourceX - connector.directionX * travelAmount * clearance
    const z = sourceZ - connector.directionZ * travelAmount * clearance
    const supportIndices = oracle.resolveSupportIndices(layerIndex, x, z)
    if (supportIndices.length === 0 || !oracle.candidateIsClear(layerIndex, x, z, true)) continue
    return {
      connectorIndex,
      connectorTargetEnd,
      id,
      layerIndex,
      supportIndices,
      terminalWitness: false,
      visibilitySectorMask: 0xff,
      x,
      z,
    } satisfies SparseNavigationCandidate
  }
  return null
}

function appendSparseSupportCandidates(
  world: ZombieEscapeSparseNavigationBuildInput,
  candidates: SparseNavigationCandidate[],
  oracle: ZombieEscapeSparseNavigationOracle,
) {
  for (const support of world.navigationSupports) {
    const layerIndex = oracle.resolveLayerIndex(support.elevation)
    appendSparseRingCandidates(
      world,
      candidates,
      layerIndex,
      support.id,
      'outer',
      support.polygon,
      oracle,
    )
    for (let holeIndex = 0; holeIndex < (support.holes?.length ?? 0); holeIndex += 1) {
      appendSparseRingCandidates(
        world,
        candidates,
        layerIndex,
        support.id,
        `hole-${String(holeIndex)}`,
        support.holes![holeIndex]!,
        oracle,
      )
    }
    const center = support.polygon.reduce(
      (sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }),
      { x: 0, z: 0 },
    )
    if (support.polygon.length > 0) {
      appendSparseNavigationCandidate(
        world,
        candidates,
        `1:support:${support.id}:center`,
        layerIndex,
        center.x / support.polygon.length,
        center.z / support.polygon.length,
        oracle,
      )
    }
  }
}

function appendSparseRingCandidates(
  world: ZombieEscapeSparseNavigationBuildInput,
  candidates: SparseNavigationCandidate[],
  layerIndex: number,
  supportId: string,
  ringId: string,
  ring: readonly Readonly<{ x: number; z: number }>[],
  oracle: ZombieEscapeSparseNavigationOracle,
) {
  const simplifiedRing = simplifySparseNavigationRing(ring, Math.max(0.1, world.agentRadius))
  const orientation = sparseNavigationRingSignedArea(simplifiedRing) >= 0 ? 1 : -1
  const clearance = world.agentRadius + Math.max(0.04, world.cellSize * 0.2)
  for (let vertex = 0; vertex < simplifiedRing.length; vertex += 1) {
    const point = simplifiedRing[vertex]!
    if (
      ringId === 'outer' &&
      !sparseNavigationRingVertexIsReflex(simplifiedRing, vertex, orientation)
    ) {
      continue
    }
    for (let direction = 0; direction < 8; direction += 1) {
      const angle = (direction / 8) * Math.PI * 2
      appendSparseNavigationCandidate(
        world,
        candidates,
        `1:support:${supportId}:${ringId}:${String(vertex)}:${String(direction)}`,
        layerIndex,
        point.x + Math.cos(angle) * clearance,
        point.z + Math.sin(angle) * clearance,
        oracle,
      )
    }
  }
}

function createSparseNavigationObstacleUnions(
  world: ZombieEscapeSparseNavigationBuildInput,
  breakablesTraversable: boolean,
) {
  return createZombieEscapeSparseObstacleFootprintUnions({
    agentRadius: world.agentRadius,
    arcToleranceMeters: SPARSE_NAVIGATION_ARC_OVERAGE_METERS,
    boxes: breakablesTraversable
      ? world.boxes
      : world.boxes.map((box) => ({ ...box, breakable: false })),
    circles: breakablesTraversable
      ? world.circles
      : world.circles.map((circle) => ({ ...circle, breakable: false })),
    layerElevations: world.navigationLayers.map(({ elevation }) => elevation),
    segments: breakablesTraversable
      ? world.segments
      : world.segments.map((segment) => ({ ...segment, breakable: false })),
  })
}

function appendSparseFreeSpaceComponentAnchors(
  world: ZombieEscapeSparseNavigationBuildInput,
  candidates: SparseNavigationCandidate[],
  oracle: ZombieEscapeSparseNavigationOracle,
  strictObstacleUnions: readonly ZombieEscapeSparseObstacleFootprintLayerUnion[],
  authoredEdges: SparseNavigationAuthoredEdge[],
  targetRegions: SparseNavigationTargetRegion[],
  fallback: boolean,
) {
  const supportBoundaryUnions = createSparseNavigationSupportBoundaryUnions(world)
  for (let layerIndex = 0; layerIndex < world.navigationLayers.length; layerIndex += 1) {
    const supportArea = createSparseNavigationLayerSupportArea(world, oracle, layerIndex)
    if (supportArea.length === 0) continue
    const boundaryArea = sparseNavigationFootprintLayerMultiPolygon(
      supportBoundaryUnions[layerIndex],
    )
    const supportedCenterArea =
      boundaryArea.length > 0 ? polygonClipping.difference(supportArea, boundaryArea) : supportArea
    const obstacleArea = sparseNavigationFootprintLayerMultiPolygon(
      strictObstacleUnions[layerIndex],
    )
    const freeSpace =
      obstacleArea.length > 0
        ? polygonClipping.difference(supportedCenterArea, obstacleArea)
        : supportedCenterArea
    const components = freeSpace
      .map((polygon) => ({
        choices: createSparseNavigationAnchorChoices(polygon),
        polygon,
        triangulation: createSparseNavigationTriangulation(polygon),
      }))
      .filter(({ choices, polygon, triangulation }) => {
        if (choices.length > 0 && triangulation.witnesses.length > 0) return true
        if (Math.abs(sparseNavigationPolygonArea(polygon)) <= INTERSECTION_EPSILON) return false
        throw new Error('Zombie Escape sparse free-space component has no interior witnesses')
      })
      .sort(
        (first, second) =>
          first.choices[0]!.z - second.choices[0]!.z || first.choices[0]!.x - second.choices[0]!.x,
      )
    for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
      const component = components[componentIndex]!
      const variant = fallback ? 'fallback' : 'strict'
      const anchorId = `0:anchor:${variant}:${String(layerIndex)}:${String(componentIndex)}`
      let anchor: SparseNavigationAnchorChoice | undefined
      for (const choice of component.choices) {
        if (
          appendSparseNavigationCandidate(
            world,
            candidates,
            anchorId,
            layerIndex,
            choice.x,
            choice.z,
            oracle,
            0xff,
            fallback,
          )
        ) {
          anchor = choice
          break
        }
      }
      if (!anchor) throw new Error('Zombie Escape sparse free-space component has no valid anchor')

      const witnessIds: string[] = []
      for (
        let witnessIndex = 0;
        witnessIndex < component.triangulation.witnesses.length;
        witnessIndex += 1
      ) {
        const witness = component.triangulation.witnesses[witnessIndex]!
        const witnessId = `0:witness:${variant}:${String(layerIndex)}:${String(componentIndex)}:${String(witnessIndex)}`
        if (
          !appendSparseNavigationCandidate(
            world,
            candidates,
            witnessId,
            layerIndex,
            witness.x,
            witness.z,
            oracle,
            0xff,
            fallback,
            true,
          )
        ) {
          throw new Error('Zombie Escape sparse free-space triangle has no valid witness')
        }
        witnessIds.push(witnessId)
        targetRegions.push({ fallback, layerIndex, triangle: witness, witnessId })
      }
      for (const edge of component.triangulation.adjacency) {
        authoredEdges.push({
          firstId: witnessIds[edge.first]!,
          secondId: witnessIds[edge.second]!,
          visibilityMask: fallback ? 2 : 3,
        })
      }
      const anchorTriangle = component.triangulation.witnesses.findIndex((triangle) =>
        sparseNavigationTriangleContainsPoint(triangle, anchor.x, anchor.z),
      )
      if (anchorTriangle < 0) {
        throw new Error('Zombie Escape sparse free-space anchor has no containing triangle')
      }
      authoredEdges.push({
        firstId: anchorId,
        secondId: witnessIds[anchorTriangle]!,
        visibilityMask: fallback ? 2 : 3,
      })
    }
  }
}

function createSparseNavigationTargetRegionIndex(
  regions: readonly SparseNavigationTargetRegion[],
  nodeById: ReadonlyMap<string, number>,
): ZombieEscapeSparseNavigationTargetRegionIndex {
  const count = regions.length
  const fallbacks = new Uint8Array(count)
  const firstXs = new Float64Array(count)
  const firstZs = new Float64Array(count)
  const layerIndices = new Int16Array(count)
  const secondXs = new Float64Array(count)
  const secondZs = new Float64Array(count)
  const thirdXs = new Float64Array(count)
  const thirdZs = new Float64Array(count)
  const witnessNodes = new Int32Array(count).fill(-1)
  for (let index = 0; index < count; index += 1) {
    const region = regions[index]!
    fallbacks[index] = region.fallback ? 1 : 0
    firstXs[index] = region.triangle.first.x
    firstZs[index] = region.triangle.first.z
    layerIndices[index] = region.layerIndex
    secondXs[index] = region.triangle.second.x
    secondZs[index] = region.triangle.second.z
    thirdXs[index] = region.triangle.third.x
    thirdZs[index] = region.triangle.third.z
    const witnessNode = nodeById.get(region.witnessId)
    if (witnessNode === undefined) {
      throw new Error('Zombie Escape sparse target region has no witness node')
    }
    witnessNodes[index] = witnessNode
  }
  const strictRegionIndices: number[] = []
  let layerCount = 0
  let minimumBucketX = Number.POSITIVE_INFINITY
  let minimumBucketZ = Number.POSITIVE_INFINITY
  let maximumBucketX = Number.NEGATIVE_INFINITY
  let maximumBucketZ = Number.NEGATIVE_INFINITY
  for (let region = 0; region < count; region += 1) {
    if (fallbacks[region] !== 0) continue
    strictRegionIndices.push(region)
    layerCount = Math.max(layerCount, layerIndices[region]! + 1)
    minimumBucketX = Math.min(
      minimumBucketX,
      Math.floor(
        Math.min(firstXs[region]!, secondXs[region]!, thirdXs[region]!) /
          SPARSE_NAVIGATION_BUCKET_SIZE_METERS,
      ),
    )
    minimumBucketZ = Math.min(
      minimumBucketZ,
      Math.floor(
        Math.min(firstZs[region]!, secondZs[region]!, thirdZs[region]!) /
          SPARSE_NAVIGATION_BUCKET_SIZE_METERS,
      ),
    )
    maximumBucketX = Math.max(
      maximumBucketX,
      Math.floor(
        Math.max(firstXs[region]!, secondXs[region]!, thirdXs[region]!) /
          SPARSE_NAVIGATION_BUCKET_SIZE_METERS,
      ),
    )
    maximumBucketZ = Math.max(
      maximumBucketZ,
      Math.floor(
        Math.max(firstZs[region]!, secondZs[region]!, thirdZs[region]!) /
          SPARSE_NAVIGATION_BUCKET_SIZE_METERS,
      ),
    )
  }
  const bucketWidth = strictRegionIndices.length > 0 ? maximumBucketX - minimumBucketX + 1 : 0
  const bucketHeight = strictRegionIndices.length > 0 ? maximumBucketZ - minimumBucketZ + 1 : 0
  const bucketCellCount = layerCount * bucketWidth * bucketHeight
  const bucketCounts = new Uint32Array(bucketCellCount)
  for (const region of strictRegionIndices) {
    const layerIndex = layerIndices[region]!
    const regionMinimumBucketX = Math.floor(
      Math.min(firstXs[region]!, secondXs[region]!, thirdXs[region]!) /
        SPARSE_NAVIGATION_BUCKET_SIZE_METERS,
    )
    const regionMinimumBucketZ = Math.floor(
      Math.min(firstZs[region]!, secondZs[region]!, thirdZs[region]!) /
        SPARSE_NAVIGATION_BUCKET_SIZE_METERS,
    )
    const regionMaximumBucketX = Math.floor(
      Math.max(firstXs[region]!, secondXs[region]!, thirdXs[region]!) /
        SPARSE_NAVIGATION_BUCKET_SIZE_METERS,
    )
    const regionMaximumBucketZ = Math.floor(
      Math.max(firstZs[region]!, secondZs[region]!, thirdZs[region]!) /
        SPARSE_NAVIGATION_BUCKET_SIZE_METERS,
    )
    for (let bucketZ = regionMinimumBucketZ; bucketZ <= regionMaximumBucketZ; bucketZ += 1) {
      for (let bucketX = regionMinimumBucketX; bucketX <= regionMaximumBucketX; bucketX += 1) {
        const cell =
          (layerIndex * bucketHeight + bucketZ - minimumBucketZ) * bucketWidth +
          bucketX -
          minimumBucketX
        bucketCounts[cell] = bucketCounts[cell]! + 1
      }
    }
  }
  const bucketOffsets = new Uint32Array(bucketCellCount + 1)
  let maximumBucketRegionCount = 0
  for (let cell = 0; cell < bucketCellCount; cell += 1) {
    maximumBucketRegionCount = Math.max(maximumBucketRegionCount, bucketCounts[cell]!)
    bucketOffsets[cell + 1] = bucketOffsets[cell]! + bucketCounts[cell]!
  }
  const bucketRegionIndices = new Uint32Array(bucketOffsets[bucketCellCount] ?? 0)
  const bucketWriteOffsets = bucketOffsets.slice(0, -1)
  for (const region of strictRegionIndices) {
    const layerIndex = layerIndices[region]!
    const regionMinimumBucketX = Math.floor(
      Math.min(firstXs[region]!, secondXs[region]!, thirdXs[region]!) /
        SPARSE_NAVIGATION_BUCKET_SIZE_METERS,
    )
    const regionMinimumBucketZ = Math.floor(
      Math.min(firstZs[region]!, secondZs[region]!, thirdZs[region]!) /
        SPARSE_NAVIGATION_BUCKET_SIZE_METERS,
    )
    const regionMaximumBucketX = Math.floor(
      Math.max(firstXs[region]!, secondXs[region]!, thirdXs[region]!) /
        SPARSE_NAVIGATION_BUCKET_SIZE_METERS,
    )
    const regionMaximumBucketZ = Math.floor(
      Math.max(firstZs[region]!, secondZs[region]!, thirdZs[region]!) /
        SPARSE_NAVIGATION_BUCKET_SIZE_METERS,
    )
    for (let bucketZ = regionMinimumBucketZ; bucketZ <= regionMaximumBucketZ; bucketZ += 1) {
      for (let bucketX = regionMinimumBucketX; bucketX <= regionMaximumBucketX; bucketX += 1) {
        const cell =
          (layerIndex * bucketHeight + bucketZ - minimumBucketZ) * bucketWidth +
          bucketX -
          minimumBucketX
        const offset = bucketWriteOffsets[cell]!
        bucketRegionIndices[offset] = region
        bucketWriteOffsets[cell] = offset + 1
      }
    }
  }
  return {
    bucketHeight,
    bucketOffsets,
    bucketRegionIndices,
    bucketSize: SPARSE_NAVIGATION_BUCKET_SIZE_METERS,
    bucketWidth,
    fallbacks,
    firstXs,
    firstZs,
    layerCount,
    layerIndices,
    maximumBucketRegionCount,
    minimumBucketX: strictRegionIndices.length > 0 ? minimumBucketX : 0,
    minimumBucketZ: strictRegionIndices.length > 0 ? minimumBucketZ : 0,
    secondXs,
    secondZs,
    thirdXs,
    thirdZs,
    witnessNodes,
  }
}

export function resolveSparseNavigationStrictRegionWitnessNode(
  index: ZombieEscapeSparseNavigationTargetRegionIndex,
  layerIndex: number,
  x: number,
  z: number,
) {
  const region = resolveSparseNavigationStrictRegionIndex(index, layerIndex, x, z)
  return region >= 0 ? index.witnessNodes[region]! : -1
}

export function resolveSparseNavigationStrictRegionIndex(
  index: ZombieEscapeSparseNavigationTargetRegionIndex,
  layerIndex: number,
  x: number,
  z: number,
) {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    layerIndex < 0 ||
    layerIndex >= index.layerCount ||
    index.bucketWidth === 0 ||
    index.bucketHeight === 0
  ) {
    return -1
  }
  const bucketX = Math.floor(x / index.bucketSize) - index.minimumBucketX
  const bucketZ = Math.floor(z / index.bucketSize) - index.minimumBucketZ
  if (bucketX < 0 || bucketX >= index.bucketWidth || bucketZ < 0 || bucketZ >= index.bucketHeight) {
    return -1
  }
  const cell = (layerIndex * index.bucketHeight + bucketZ) * index.bucketWidth + bucketX
  let matchingRegion = -1
  let matchingWitnessNode = -1
  for (
    let offset = index.bucketOffsets[cell]!;
    offset < index.bucketOffsets[cell + 1]!;
    offset += 1
  ) {
    const region = index.bucketRegionIndices[offset]!
    if (!sparseNavigationTargetRegionContainsPoint(index, region, x, z)) continue
    const candidate = index.witnessNodes[region]!
    if (candidate >= 0 && (matchingWitnessNode < 0 || candidate < matchingWitnessNode)) {
      matchingRegion = region
      matchingWitnessNode = candidate
    }
  }
  return matchingRegion
}

export function resolveSparseNavigationNearestStrictTargetProjection(
  index: ZombieEscapeSparseNavigationTargetRegionIndex,
  layerIndex: number,
  x: number,
  z: number,
  maximumDistance: number,
  output: ZombieEscapeSparseNavigationTargetProjection,
) {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    !Number.isFinite(maximumDistance) ||
    maximumDistance < 0 ||
    layerIndex < 0 ||
    layerIndex >= index.layerCount ||
    index.bucketWidth === 0 ||
    index.bucketHeight === 0
  ) {
    return false
  }

  const maximumDistanceSquared = maximumDistance * maximumDistance
  const minimumBucketX = Math.max(
    0,
    Math.floor((x - maximumDistance) / index.bucketSize) - index.minimumBucketX,
  )
  const maximumBucketX = Math.min(
    index.bucketWidth - 1,
    Math.floor((x + maximumDistance) / index.bucketSize) - index.minimumBucketX,
  )
  const minimumBucketZ = Math.max(
    0,
    Math.floor((z - maximumDistance) / index.bucketSize) - index.minimumBucketZ,
  )
  const maximumBucketZ = Math.min(
    index.bucketHeight - 1,
    Math.floor((z + maximumDistance) / index.bucketSize) - index.minimumBucketZ,
  )
  if (minimumBucketX > maximumBucketX || minimumBucketZ > maximumBucketZ) return false

  let bestDistanceSquared = maximumDistanceSquared
  let bestRegionIndex = -1
  let bestX = x
  let bestZ = z
  for (let bucketZ = minimumBucketZ; bucketZ <= maximumBucketZ; bucketZ += 1) {
    for (let bucketX = minimumBucketX; bucketX <= maximumBucketX; bucketX += 1) {
      const cell = (layerIndex * index.bucketHeight + bucketZ) * index.bucketWidth + bucketX
      for (
        let offset = index.bucketOffsets[cell]!;
        offset < index.bucketOffsets[cell + 1]!;
        offset += 1
      ) {
        const regionIndex = index.bucketRegionIndices[offset]!
        sparseNavigationClosestPointOnTargetRegion(index, regionIndex, x, z, output)
        const projectedX = output.x
        const projectedZ = output.z
        const distanceSquared = (projectedX - x) ** 2 + (projectedZ - z) ** 2
        if (
          distanceSquared > bestDistanceSquared + INTERSECTION_EPSILON ||
          (Math.abs(distanceSquared - bestDistanceSquared) <= INTERSECTION_EPSILON &&
            bestRegionIndex >= 0 &&
            index.witnessNodes[regionIndex]! >= index.witnessNodes[bestRegionIndex]!)
        ) {
          continue
        }
        bestDistanceSquared = distanceSquared
        bestRegionIndex = regionIndex
        bestX = projectedX
        bestZ = projectedZ
      }
    }
  }
  if (bestRegionIndex < 0) return false
  output.distanceSquared = bestDistanceSquared
  output.regionIndex = bestRegionIndex
  output.x = bestX
  output.z = bestZ
  return true
}

function sparseNavigationClosestPointOnTargetRegion(
  index: ZombieEscapeSparseNavigationTargetRegionIndex,
  region: number,
  x: number,
  z: number,
  output: Pick<ZombieEscapeSparseNavigationTargetProjection, 'x' | 'z'>,
) {
  if (sparseNavigationTargetRegionContainsPoint(index, region, x, z)) {
    output.x = x
    output.z = z
    return
  }
  let bestDistanceSquared = Number.POSITIVE_INFINITY
  let bestX = x
  let bestZ = z
  for (const [startX, startZ, endX, endZ] of [
    [
      index.firstXs[region]!,
      index.firstZs[region]!,
      index.secondXs[region]!,
      index.secondZs[region]!,
    ],
    [
      index.secondXs[region]!,
      index.secondZs[region]!,
      index.thirdXs[region]!,
      index.thirdZs[region]!,
    ],
    [
      index.thirdXs[region]!,
      index.thirdZs[region]!,
      index.firstXs[region]!,
      index.firstZs[region]!,
    ],
  ] as const) {
    const directionX = endX - startX
    const directionZ = endZ - startZ
    const lengthSquared = directionX * directionX + directionZ * directionZ
    const amount =
      lengthSquared <= INTERSECTION_EPSILON
        ? 0
        : Math.max(
            0,
            Math.min(1, ((x - startX) * directionX + (z - startZ) * directionZ) / lengthSquared),
          )
    const candidateX = startX + directionX * amount
    const candidateZ = startZ + directionZ * amount
    const distanceSquared = (candidateX - x) ** 2 + (candidateZ - z) ** 2
    if (distanceSquared >= bestDistanceSquared) continue
    bestDistanceSquared = distanceSquared
    bestX = candidateX
    bestZ = candidateZ
  }
  output.x = bestX
  output.z = bestZ
}

export function sparseNavigationTargetRegionContainsPoint(
  index: ZombieEscapeSparseNavigationTargetRegionIndex,
  region: number,
  x: number,
  z: number,
) {
  const firstX = index.firstXs[region]!
  const firstZ = index.firstZs[region]!
  const secondX = index.secondXs[region]!
  const secondZ = index.secondZs[region]!
  const thirdX = index.thirdXs[region]!
  const thirdZ = index.thirdZs[region]!
  const firstCross = (secondX - firstX) * (z - firstZ) - (secondZ - firstZ) * (x - firstX)
  const secondCross = (thirdX - secondX) * (z - secondZ) - (thirdZ - secondZ) * (x - secondX)
  const thirdCross = (firstX - thirdX) * (z - thirdZ) - (firstZ - thirdZ) * (x - thirdX)
  const hasNegative =
    firstCross < -INTERSECTION_EPSILON ||
    secondCross < -INTERSECTION_EPSILON ||
    thirdCross < -INTERSECTION_EPSILON
  const hasPositive =
    firstCross > INTERSECTION_EPSILON ||
    secondCross > INTERSECTION_EPSILON ||
    thirdCross > INTERSECTION_EPSILON
  return !(hasNegative && hasPositive)
}

function createSparseNavigationSupportBoundaryUnions(
  world: ZombieEscapeSparseNavigationBuildInput,
) {
  const segments: ZombieEscapeSparseObstacleFootprintSegment[] = []
  for (const support of world.navigationSupports) {
    for (const ring of [support.polygon, ...(support.holes ?? [])]) {
      for (let pointIndex = 0; pointIndex < ring.length; pointIndex += 1) {
        const start = ring[pointIndex]!
        const end = ring[(pointIndex + 1) % ring.length]!
        if (Math.hypot(end.x - start.x, end.z - start.z) <= INTERSECTION_EPSILON) continue
        segments.push({
          breakable: false,
          endCap: 'round',
          endX: end.x,
          endZ: end.z,
          halfThickness: 0,
          maximumY: support.elevation + COLLISION_EPSILON_METERS * 2,
          minimumY: support.elevation - COLLISION_EPSILON_METERS * 2,
          startCap: 'round',
          startX: start.x,
          startZ: start.z,
        })
      }
    }
  }
  return createZombieEscapeSparseObstacleFootprintUnions({
    agentRadius: world.agentRadius,
    arcToleranceMeters: SPARSE_NAVIGATION_ARC_OVERAGE_METERS,
    boxes: [],
    circles: [],
    layerElevations: world.navigationLayers.map(({ elevation }) => elevation),
    segments,
  })
}

function createSparseNavigationLayerSupportArea(
  world: ZombieEscapeSparseNavigationBuildInput,
  oracle: ZombieEscapeSparseNavigationOracle,
  layerIndex: number,
) {
  const polygons = world.navigationSupports
    .filter((support) => oracle.resolveLayerIndex(support.elevation) === layerIndex)
    .map((support) => [
      closeSparseNavigationClippingRing(support.polygon),
      ...(support.holes ?? []).map(closeSparseNavigationClippingRing),
    ])
    .filter((polygon) => polygon[0]!.length >= 4) as Polygon[]
  const first = polygons[0]
  if (!first) return [] satisfies MultiPolygon
  return polygons.length === 1 ? [first] : polygonClipping.union(first, ...polygons.slice(1))
}

function sparseNavigationFootprintLayerMultiPolygon(
  layer: ZombieEscapeSparseObstacleFootprintLayerUnion | undefined,
) {
  if (!layer) return [] satisfies MultiPolygon
  return layer.components.map((component) => [
    closeSparseNavigationClippingRing(component.outer),
    ...component.holes.map(closeSparseNavigationClippingRing),
  ]) as MultiPolygon
}

function closeSparseNavigationClippingRing(points: readonly Readonly<{ x: number; z: number }>[]) {
  const ring: Ring = points.map(({ x, z }) => [x, z])
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([first[0], first[1]])
  }
  return ring
}

type SparseNavigationAnchorChoice = Readonly<{
  width: number
  x: number
  z: number
}>

function createSparseNavigationAnchorChoices(polygon: Polygon) {
  const zCoordinates = polygon
    .flatMap((ring) => ring.map((point) => point[1]))
    .sort((first, second) => first - second)
    .filter(
      (coordinate, index, coordinates) =>
        index === 0 || Math.abs(coordinate - coordinates[index - 1]!) > INTERSECTION_EPSILON,
    )
  const choices: SparseNavigationAnchorChoice[] = []
  for (let slab = 0; slab + 1 < zCoordinates.length; slab += 1) {
    const minimumZ = zCoordinates[slab]!
    const maximumZ = zCoordinates[slab + 1]!
    if (maximumZ - minimumZ <= INTERSECTION_EPSILON) continue
    const z = (minimumZ + maximumZ) * 0.5
    const intersections: number[] = []
    for (const ring of polygon) {
      for (let pointIndex = 0; pointIndex < ring.length; pointIndex += 1) {
        const start = ring[pointIndex]!
        const end = ring[(pointIndex + 1) % ring.length]!
        if (!((start[1] <= z && end[1] > z) || (end[1] <= z && start[1] > z))) continue
        intersections.push(start[0] + ((z - start[1]) * (end[0] - start[0])) / (end[1] - start[1]))
      }
    }
    intersections.sort((first, second) => first - second)
    for (let interval = 0; interval + 1 < intersections.length; interval += 2) {
      const minimumX = intersections[interval]!
      const maximumX = intersections[interval + 1]!
      const width = maximumX - minimumX
      if (width <= INTERSECTION_EPSILON) continue
      choices.push({ width, x: (minimumX + maximumX) * 0.5, z })
    }
  }
  return choices.sort(
    (first, second) => second.width - first.width || first.z - second.z || first.x - second.x,
  )
}

function createSparseNavigationTriangulation(polygon: Polygon): SparseNavigationTriangulation {
  const rings = polygon.map(openSparseNavigationClippingRing).filter((ring) => ring.length >= 3)
  const contourRing = rings[0]
  if (!contourRing) return { adjacency: [], witnesses: [] }
  const coordinates: number[] = []
  const holeIndices: number[] = []
  const points: SparseNavigationTriangulationPoint[] = []
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
    if (ringIndex > 0) holeIndices.push(points.length)
    for (const [x, z] of rings[ringIndex]!) {
      coordinates.push(x, z)
      points.push({ x, z })
    }
  }
  const triangleIndices = earcut(coordinates, holeIndices, 2)
  const adjacency: Array<Readonly<{ first: number; second: number }>> = []
  const edgeOwners = new Map<string, number>()
  const witnesses: SparseNavigationTriangleWitness[] = []
  for (let triangleOffset = 0; triangleOffset + 2 < triangleIndices.length; triangleOffset += 3) {
    const firstIndex = triangleIndices[triangleOffset]!
    const secondIndex = triangleIndices[triangleOffset + 1]!
    const thirdIndex = triangleIndices[triangleOffset + 2]!
    const first = points[firstIndex]
    const second = points[secondIndex]
    const third = points[thirdIndex]
    if (!(first && second && third)) continue
    const twiceArea = Math.abs(
      (second.x - first.x) * (third.z - first.z) - (second.z - first.z) * (third.x - first.x),
    )
    if (twiceArea <= INTERSECTION_EPSILON) continue
    const witnessIndex = witnesses.length
    witnesses.push({
      first,
      second,
      third,
      x: (first.x + second.x + third.x) / 3,
      z: (first.z + second.z + third.z) / 3,
    })
    for (const [edgeFirst, edgeSecond] of [
      [firstIndex, secondIndex],
      [secondIndex, thirdIndex],
      [thirdIndex, firstIndex],
    ] as const) {
      const minimum = Math.min(edgeFirst, edgeSecond)
      const maximum = Math.max(edgeFirst, edgeSecond)
      const key = `${String(minimum)}:${String(maximum)}`
      const owner = edgeOwners.get(key)
      if (owner === undefined) edgeOwners.set(key, witnessIndex)
      else adjacency.push({ first: owner, second: witnessIndex })
    }
  }
  return { adjacency, witnesses }
}

function sparseNavigationTriangleContainsPoint(
  triangle: SparseNavigationTriangleWitness,
  x: number,
  z: number,
) {
  const firstCross =
    (triangle.second.x - triangle.first.x) * (z - triangle.first.z) -
    (triangle.second.z - triangle.first.z) * (x - triangle.first.x)
  const secondCross =
    (triangle.third.x - triangle.second.x) * (z - triangle.second.z) -
    (triangle.third.z - triangle.second.z) * (x - triangle.second.x)
  const thirdCross =
    (triangle.first.x - triangle.third.x) * (z - triangle.third.z) -
    (triangle.first.z - triangle.third.z) * (x - triangle.third.x)
  const hasNegative =
    firstCross < -INTERSECTION_EPSILON ||
    secondCross < -INTERSECTION_EPSILON ||
    thirdCross < -INTERSECTION_EPSILON
  const hasPositive =
    firstCross > INTERSECTION_EPSILON ||
    secondCross > INTERSECTION_EPSILON ||
    thirdCross > INTERSECTION_EPSILON
  return !(hasNegative && hasPositive)
}

function openSparseNavigationClippingRing(ring: Ring) {
  const first = ring[0]
  const last = ring[ring.length - 1]
  return first && last && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring
}

function sparseNavigationPolygonArea(polygon: Polygon) {
  let area = 0
  for (const ring of polygon) {
    for (let pointIndex = 0; pointIndex + 1 < ring.length; pointIndex += 1) {
      const point = ring[pointIndex]!
      const next = ring[pointIndex + 1]!
      area += point[0] * next[1] - next[0] * point[1]
    }
  }
  return area * 0.5
}

function appendSparseObstacleUnionCandidates(
  world: ZombieEscapeSparseNavigationBuildInput,
  candidates: SparseNavigationCandidate[],
  boundaryEdges: Array<Readonly<{ firstId: string; secondId: string }>>,
  oracle: ZombieEscapeSparseNavigationOracle,
  unions: readonly ZombieEscapeSparseObstacleFootprintLayerUnion[],
) {
  for (const layer of unions) {
    for (let componentIndex = 0; componentIndex < layer.components.length; componentIndex += 1) {
      const component = layer.components[componentIndex]!
      appendSparseObstacleUnionRingCandidates(
        world,
        candidates,
        layer.layerIndex,
        `outer:${String(componentIndex)}`,
        component.outer,
        boundaryEdges,
        oracle,
      )
      for (let holeIndex = 0; holeIndex < component.holes.length; holeIndex += 1) {
        appendSparseObstacleUnionRingCandidates(
          world,
          candidates,
          layer.layerIndex,
          `hole:${String(componentIndex)}:${String(holeIndex)}`,
          component.holes[holeIndex]!,
          boundaryEdges,
          oracle,
        )
      }
    }
  }
}

function appendSparseObstacleUnionRingCandidates(
  world: ZombieEscapeSparseNavigationBuildInput,
  candidates: SparseNavigationCandidate[],
  layerIndex: number,
  ringId: string,
  ring: readonly Readonly<{ x: number; z: number }>[],
  boundaryEdges: Array<Readonly<{ firstId: string; secondId: string }>>,
  oracle: ZombieEscapeSparseNavigationOracle,
) {
  const candidateIds: string[] = []
  const spannerSpacing = Math.max(0.4, world.agentRadius)
  let distanceSinceSpannerCandidate = spannerSpacing
  for (let vertexIndex = 0; vertexIndex < ring.length; vertexIndex += 1) {
    const previous = ring[(vertexIndex + ring.length - 1) % ring.length]!
    const vertex = ring[vertexIndex]!
    const next = ring[(vertexIndex + 1) % ring.length]!
    const previousLength = Math.hypot(vertex.x - previous.x, vertex.z - previous.z)
    const nextLength = Math.hypot(next.x - vertex.x, next.z - vertex.z)
    if (previousLength <= INTERSECTION_EPSILON || nextLength <= INTERSECTION_EPSILON) continue
    const previousX = (vertex.x - previous.x) / previousLength
    const previousZ = (vertex.z - previous.z) / previousLength
    const nextX = (next.x - vertex.x) / nextLength
    const nextZ = (next.z - vertex.z) / nextLength
    const signedTurnCross = previousX * nextZ - previousZ * nextX
    if (signedTurnCross <= INTERSECTION_EPSILON) continue
    distanceSinceSpannerCandidate += previousLength
    const turn = Math.atan2(signedTurnCross, previousX * nextX + previousZ * nextZ)
    const participatesInSpanner =
      turn >= Math.PI / 8 || distanceSinceSpannerCandidate >= spannerSpacing
    const previousOutwardX = previousZ
    const previousOutwardZ = -previousX
    const nextOutwardX = nextZ
    const nextOutwardZ = -nextX
    const outwardLength = Math.hypot(
      previousOutwardX + nextOutwardX,
      previousOutwardZ + nextOutwardZ,
    )
    const directions =
      outwardLength > INTERSECTION_EPSILON
        ? [
            {
              x: (previousOutwardX + nextOutwardX) / outwardLength,
              z: (previousOutwardZ + nextOutwardZ) / outwardLength,
            },
          ]
        : [
            { x: previousOutwardX, z: previousOutwardZ },
            { x: nextOutwardX, z: nextOutwardZ },
          ]
    for (let directionIndex = 0; directionIndex < directions.length; directionIndex += 1) {
      const direction = directions[directionIndex]!
      const id = `2:union:${String(layerIndex)}:${ringId}:${String(vertexIndex)}:${String(directionIndex)}`
      const maximumClearance = Math.min(0.04, Math.max(0.004, world.agentRadius * 0.1))
      for (
        let clearance = COLLISION_EPSILON_METERS * 2;
        clearance <= maximumClearance + INTERSECTION_EPSILON;
        clearance *= 2
      ) {
        const appended = appendSparseNavigationCandidate(
          world,
          candidates,
          id,
          layerIndex,
          vertex.x + direction.x * clearance,
          vertex.z + direction.z * clearance,
          oracle,
          participatesInSpanner ? sparseNavigationOutwardSectorMask(direction.x, direction.z) : 0,
        )
        if (!appended) continue
        candidateIds.push(id)
        if (participatesInSpanner) distanceSinceSpannerCandidate = 0
        break
      }
    }
  }
  for (let index = 0; index < candidateIds.length; index += 1) {
    const firstId = candidateIds[index]!
    const secondId = candidateIds[(index + 1) % candidateIds.length]
    if (secondId && firstId !== secondId) boundaryEdges.push({ firstId, secondId })
  }
}

function appendSparseNavigationCandidate(
  world: ZombieEscapeSparseNavigationBuildInput,
  candidates: SparseNavigationCandidate[],
  id: string,
  layerIndex: number,
  x: number,
  z: number,
  oracle: ZombieEscapeSparseNavigationOracle,
  visibilitySectorMask = 0xff,
  breakablesTraversable = true,
  terminalWitness = false,
) {
  const supportIndices = oracle.resolveSupportIndices(layerIndex, x, z)
  if (
    layerIndex < 0 ||
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    supportIndices.length === 0 ||
    !oracle.candidateIsClear(layerIndex, x, z, breakablesTraversable)
  ) {
    return false
  }
  candidates.push({
    connectorIndex: -1,
    connectorTargetEnd: false,
    id,
    layerIndex,
    supportIndices,
    terminalWitness,
    visibilitySectorMask,
    x,
    z,
  })
  return true
}

function simplifySparseNavigationRing(
  ring: readonly Readonly<{ x: number; z: number }>[],
  tolerance: number,
) {
  const points = dedupeSparseNavigationRing(ring)
  if (points.length <= 3 || tolerance <= 0) return points

  let firstAnchor = 0
  let secondAnchor = Math.floor(points.length / 2)
  let maximumDistanceSquared = -1
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      const distanceSquared =
        (points[second]!.x - points[first]!.x) ** 2 + (points[second]!.z - points[first]!.z) ** 2
      if (distanceSquared <= maximumDistanceSquared) continue
      maximumDistanceSquared = distanceSquared
      firstAnchor = first
      secondAnchor = second
    }
  }
  const forward = points.slice(firstAnchor, secondAnchor + 1)
  const wrapped = [...points.slice(secondAnchor), ...points.slice(0, firstAnchor + 1)]
  const simplified = dedupeSparseNavigationRing(
    [
      ...simplifySparseNavigationPolyline(forward, tolerance).slice(0, -1),
      ...simplifySparseNavigationPolyline(wrapped, tolerance).slice(0, -1),
    ],
    tolerance * 0.25,
  )
  return simplified.length >= 3 ? simplified : points
}

function simplifySparseNavigationPolyline(
  points: readonly Readonly<{ x: number; z: number }>[],
  tolerance: number,
): Readonly<{ x: number; z: number }>[] {
  if (points.length <= 2) return [...points]
  const start = points[0]!
  const end = points[points.length - 1]!
  let maximumDistance = -1
  let splitIndex = -1
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = sparseNavigationPointLineDistance(points[index]!, start, end)
    if (distance <= maximumDistance) continue
    maximumDistance = distance
    splitIndex = index
  }
  if (maximumDistance <= tolerance || splitIndex < 0) return [start, end]
  const left = simplifySparseNavigationPolyline(points.slice(0, splitIndex + 1), tolerance)
  const right = simplifySparseNavigationPolyline(points.slice(splitIndex), tolerance)
  return [...left.slice(0, -1), ...right]
}

function sparseNavigationPointLineDistance(
  point: Readonly<{ x: number; z: number }>,
  start: Readonly<{ x: number; z: number }>,
  end: Readonly<{ x: number; z: number }>,
) {
  const directionX = end.x - start.x
  const directionZ = end.z - start.z
  const lengthSquared = directionX * directionX + directionZ * directionZ
  if (lengthSquared <= INTERSECTION_EPSILON) return Math.hypot(point.x - start.x, point.z - start.z)
  return (
    Math.abs((point.x - start.x) * directionZ - (point.z - start.z) * directionX) /
    Math.sqrt(lengthSquared)
  )
}

function dedupeSparseNavigationRing(
  ring: readonly Readonly<{ x: number; z: number }>[],
  tolerance = 0.000_001,
) {
  const points: Array<Readonly<{ x: number; z: number }>> = []
  for (const point of ring) {
    const previous = points[points.length - 1]
    if (previous && Math.hypot(point.x - previous.x, point.z - previous.z) <= tolerance) continue
    points.push(point)
  }
  const first = points[0]
  const last = points[points.length - 1]
  if (
    first &&
    last &&
    points.length > 2 &&
    Math.hypot(first.x - last.x, first.z - last.z) <= tolerance
  ) {
    points.pop()
  }
  return points
}

function sparseNavigationRingSignedArea(ring: readonly Readonly<{ x: number; z: number }>[]) {
  let area = 0
  for (let index = 0; index < ring.length; index += 1) {
    const point = ring[index]!
    const next = ring[(index + 1) % ring.length]!
    area += point.x * next.z - next.x * point.z
  }
  return area * 0.5
}

function sparseNavigationRingVertexIsReflex(
  ring: readonly Readonly<{ x: number; z: number }>[],
  vertex: number,
  orientation: number,
) {
  const previous = ring[(vertex + ring.length - 1) % ring.length]!
  const point = ring[vertex]!
  const next = ring[(vertex + 1) % ring.length]!
  const cross =
    (point.x - previous.x) * (next.z - point.z) - (point.z - previous.z) * (next.x - point.x)
  return cross * orientation < -INTERSECTION_EPSILON
}

function appendSparseNavigationEdge(
  edges: SparseNavigationEdge[],
  keys: Set<string>,
  first: number,
  second: number,
  weight: number,
  breachObjectIndices: readonly number[],
) {
  const minimum = Math.min(first, second)
  const maximum = Math.max(first, second)
  if (minimum === maximum) return
  const key = `${String(minimum)}:${String(maximum)}`
  if (keys.has(key)) return
  keys.add(key)
  edges.push({
    breachObjectIndices: [...breachObjectIndices],
    first: minimum,
    second: maximum,
    weight: Math.max(0.001, weight),
  })
}

function createSparseNavigationAdjacency(
  nodeCount: number,
  edges: readonly SparseNavigationEdge[],
) {
  const directed = edges
    .flatMap((edge) => [
      {
        breachObjectIndices: edge.breachObjectIndices,
        from: edge.first,
        to: edge.second,
        weight: edge.weight,
      },
      {
        breachObjectIndices: edge.breachObjectIndices,
        from: edge.second,
        to: edge.first,
        weight: edge.weight,
      },
    ])
    .sort((first, second) => first.from - second.from || first.to - second.to)
  const nodeOffsets = new Uint32Array(nodeCount + 1)
  for (const edge of directed) nodeOffsets[edge.from + 1]! += 1
  for (let node = 0; node < nodeCount; node += 1) {
    nodeOffsets[node + 1] = nodeOffsets[node + 1]! + nodeOffsets[node]!
  }
  const breachObjectOffsets = new Uint32Array(directed.length + 1)
  for (let edge = 0; edge < directed.length; edge += 1) {
    breachObjectOffsets[edge + 1] =
      breachObjectOffsets[edge]! + directed[edge]!.breachObjectIndices.length
  }
  const breachObjectIndices = new Uint32Array(breachObjectOffsets[directed.length] ?? 0)
  for (let edge = 0; edge < directed.length; edge += 1) {
    breachObjectIndices.set(directed[edge]!.breachObjectIndices, breachObjectOffsets[edge])
  }
  return {
    breachCounts: new Uint32Array(directed.map((edge) => edge.breachObjectIndices.length)),
    breachObjectIndices,
    breachObjectOffsets,
    nodeOffsets,
    toNodes: new Int32Array(directed.map((edge) => edge.to)),
    weights: new Float32Array(directed.map((edge) => edge.weight)),
  }
}

function sparseNavigationAdjacencyBreachObjectCount(
  adjacency: ZombieEscapeSparseNavigationAdjacency,
) {
  let maximum = -1
  for (const objectIndex of adjacency.breachObjectIndices) maximum = Math.max(maximum, objectIndex)
  return maximum + 1
}

function createSparseNavigationComponentIndices(
  adjacency: ZombieEscapeSparseNavigationAdjacency,
  layerIndices?: Int16Array,
) {
  const nodeCount = adjacency.nodeOffsets.length - 1
  const componentIndices = new Int32Array(nodeCount).fill(-1)
  const queue = new Int32Array(nodeCount)
  let componentIndex = 0
  for (let start = 0; start < nodeCount; start += 1) {
    if (componentIndices[start]! >= 0) continue
    let read = 0
    let write = 1
    queue[0] = start
    componentIndices[start] = componentIndex
    while (read < write) {
      const node = queue[read++]!
      for (
        let edge = adjacency.nodeOffsets[node]!;
        edge < adjacency.nodeOffsets[node + 1]!;
        edge += 1
      ) {
        const neighbor = adjacency.toNodes[edge]!
        if (layerIndices && layerIndices[neighbor] !== layerIndices[node]) continue
        if (componentIndices[neighbor]! >= 0) continue
        componentIndices[neighbor] = componentIndex
        queue[write++] = neighbor
      }
    }
    componentIndex += 1
  }
  return componentIndices
}

export function sparseNavigationBucketKey(layerIndex: number, bucketX: number, bucketZ: number) {
  return `${String(layerIndex)}:${String(bucketX)}:${String(bucketZ)}`
}
