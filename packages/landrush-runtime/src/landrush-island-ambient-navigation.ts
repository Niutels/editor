import type { LandrushNavigationPoint2 as LandrushPoint2 } from './navigation-geometry'
import {
  landrushIslandNavigationSegmentIntersectsPolygon,
  openPointRing,
  pointInPolygon,
  pointInPolygonOrNearEdge,
  pointsAlmostEqual2,
  segmentsIntersect2,
} from './navigation-geometry'

export type LandrushRoadSegment = Readonly<{
  id: string
  kind: string
  fromNodeId: string
  toNodeId: string
  points: readonly LandrushPoint2[]
  r3fPoints: readonly (readonly [number, number, number])[]
  width: number
  connectsParcelIds: readonly string[]
}>

const NAVIGATION_CANDIDATE_OFFSET_METERS = 0.5
const NAVIGATION_MAX_GRAPH_POINTS = 120
const NAVIGATION_STATIC_EDGE_CACHE_MAX_ENTRIES = 16_384
const GRASS_ROAD_CLEARANCE_METERS = 0.8
const NAVIGATION_SPATIAL_CELL_SIZE_METERS = 8
const NAVIGATION_SPATIAL_EPSILON_METERS = 0.000_000_1
const EMPTY_CANDIDATE_INDICES = Object.freeze([]) as readonly number[]

export type LandrushIslandAmbientNavigationObstacle = {
  id: string
  points: readonly LandrushPoint2[]
}

export type LandrushIslandAmbientNavigationWorld = {
  obstacles: readonly LandrushIslandAmbientNavigationObstacle[]
  roads: readonly LandrushRoadSegment[]
  surfacePoints: readonly LandrushPoint2[]
}

export type LandrushIslandAmbientDestinationPreference = 'grass' | 'mixed'

type LandrushIslandAmbientSpatialQueryKind =
  | 'graph-build'
  | 'graph-query'
  | 'obstacle-distance'
  | 'obstacle-point'
  | 'obstacle-segment'
  | 'shoreline-segment'

type LandrushIslandAmbientSpatialQueryObservation = {
  candidateCount: number
  kind: LandrushIslandAmbientSpatialQueryKind
  totalCount: number
}

type LandrushIslandAmbientNavigationWorldFactoryOptions = {
  observeSpatialQuery?: (observation: LandrushIslandAmbientSpatialQueryObservation) => void
}

type LandrushIslandAmbientNavigationShorelineEdge = {
  end: LandrushPoint2
  start: LandrushPoint2
}

type LandrushIslandAmbientNavigationCellBounds = {
  maxCellX: number
  maxCellZ: number
  minCellX: number
  minCellZ: number
}

type LandrushIslandAmbientNavigationSpatialIndex = {
  cellSize: number
  obstacleCellBounds: LandrushIslandAmbientNavigationCellBounds | null
  obstacleCells: ReadonlyMap<string, readonly number[]>
  observeSpatialQuery?: (observation: LandrushIslandAmbientSpatialQueryObservation) => void
  shorelineCells: ReadonlyMap<string, readonly number[]>
  shorelineEdges: readonly LandrushIslandAmbientNavigationShorelineEdge[]
}

type LandrushIslandAmbientNavigationCandidate = {
  id: number
  point: LandrushPoint2
}

const EMPTY_NAVIGATION_CANDIDATES = Object.freeze(
  [],
) as readonly LandrushIslandAmbientNavigationCandidate[]

type LandrushIslandAmbientNavigationGraph = {
  candidates: readonly LandrushIslandAmbientNavigationCandidate[]
  staticEdgePassability: Map<number, boolean>
}

type LandrushIslandAmbientNavigationGraphQueryStats = {
  cacheMissCount: number
  staticEdgeLookupCount: number
}

type LandrushIslandAmbientNavigationRankedCandidate = {
  candidate: LandrushIslandAmbientNavigationCandidate
  score: number
}

type LandrushIslandAmbientWalkablePathSearchPhase =
  | 'complete'
  | 'rank-candidates'
  | 'reconstruct-backward'
  | 'reconstruct-forward'
  | 'relax-neighbors'
  | 'select-current'
  | 'sort-candidates'

type LandrushIslandAmbientWalkablePathSearchState = {
  allCandidates: readonly LandrushIslandAmbientNavigationCandidate[]
  completedPath: readonly LandrushPoint2[] | null
  currentIndex: number
  completedAdvanceResult: {
    done: true
    operations: number
    path: readonly LandrushPoint2[]
  }
  distances: Array<number | undefined>
  navigationGraph: LandrushIslandAmbientNavigationGraph | undefined
  phase: LandrushIslandAmbientWalkablePathSearchPhase
  pendingAdvanceResult: {
    done: false
    operations: number
  }
  pointCount: number
  previous: Array<number | undefined>
  queryStats: LandrushIslandAmbientNavigationGraphQueryStats
  rankedCandidates: LandrushIslandAmbientNavigationRankedCandidate[]
  rankingIndex: number
  reconstructCopyIndex: number
  reconstructIndex: number
  reconstructedPath: LandrushPoint2[]
  reversedPath: LandrushPoint2[]
  relaxNextIndex: number
  selectedCandidateCount: number
  selectBestIndex: number
  selectBestScore: number
  selectScanIndex: number
  sortDestination: LandrushIslandAmbientNavigationRankedCandidate[]
  sortLeftEnd: number
  sortLeftIndex: number
  sortOutputIndex: number
  sortRightEnd: number
  sortRightIndex: number
  sortRunStart: number
  sortSource: LandrushIslandAmbientNavigationRankedCandidate[]
  sortWidth: number
  start: LandrushPoint2
  target: LandrushPoint2
  visited: Uint8Array
  world: LandrushIslandAmbientNavigationWorld
}

declare const landrushIslandAmbientWalkablePathSearchType: unique symbol

export type LandrushIslandAmbientWalkablePathSearch = {
  readonly [landrushIslandAmbientWalkablePathSearchType]: true
}

export type LandrushIslandAmbientWalkablePathSearchAdvanceResult =
  | {
      done: false
      operations: number
    }
  | {
      done: true
      operations: number
      path: readonly LandrushPoint2[]
    }

const spatialIndexByWorld = new WeakMap<
  LandrushIslandAmbientNavigationWorld,
  LandrushIslandAmbientNavigationSpatialIndex
>()
const spatialIndexByObstacleList = new WeakMap<
  readonly LandrushIslandAmbientNavigationObstacle[],
  LandrushIslandAmbientNavigationSpatialIndex
>()
const navigationGraphByWorld = new WeakMap<
  LandrushIslandAmbientNavigationWorld,
  LandrushIslandAmbientNavigationGraph
>()

export function createLandrushIslandAmbientNavigationWorld(
  source: LandrushIslandAmbientNavigationWorld,
  options: LandrushIslandAmbientNavigationWorldFactoryOptions = {},
): LandrushIslandAmbientNavigationWorld {
  const obstacles = Object.freeze(
    source.obstacles.map((obstacle) =>
      Object.freeze({
        id: obstacle.id,
        points: freezePoints(obstacle.points),
      }),
    ),
  )
  const roads = Object.freeze(
    source.roads.map((road) =>
      Object.freeze({
        ...road,
        connectsParcelIds: Object.freeze([...road.connectsParcelIds]),
        points: freezePoints(road.points),
        r3fPoints: Object.freeze(
          road.r3fPoints.map((point) => Object.freeze([point[0], point[1], point[2]] as const)),
        ),
      }),
    ),
  )
  const world = Object.freeze({
    obstacles,
    roads,
    surfacePoints: freezePoints(source.surfacePoints),
  })
  const spatialIndex = createNavigationSpatialIndex(world, options.observeSpatialQuery)
  spatialIndexByWorld.set(world, spatialIndex)
  spatialIndexByObstacleList.set(obstacles, spatialIndex)
  const navigationGraph = createNavigationGraph(world)
  navigationGraphByWorld.set(world, navigationGraph)
  observeSpatialQuery(spatialIndex, 'graph-build', navigationGraph.candidates.length, 0)
  return world
}

export type LandrushIslandAmbientPreparedNavigationWorld = {
  world: LandrushIslandAmbientNavigationWorld
  spatialIndex: Omit<LandrushIslandAmbientNavigationSpatialIndex, 'observeSpatialQuery'>
  navigationGraph: LandrushIslandAmbientNavigationGraph
}

export function captureLandrushIslandAmbientPreparedNavigationWorld(
  world: LandrushIslandAmbientNavigationWorld,
): LandrushIslandAmbientPreparedNavigationWorld {
  const index = spatialIndexByWorld.get(world)
  const navigationGraph = navigationGraphByWorld.get(world)
  if (!index || !navigationGraph) throw new Error('Ambient navigation world has not been prepared')
  const spatialIndex = { ...index }
  delete spatialIndex.observeSpatialQuery
  return { world, spatialIndex, navigationGraph }
}

export function hydrateLandrushIslandAmbientPreparedNavigationWorld(
  prepared: LandrushIslandAmbientPreparedNavigationWorld,
  options: LandrushIslandAmbientNavigationWorldFactoryOptions = {},
) {
  const { world, navigationGraph } = prepared
  const spatialIndex = {
    ...prepared.spatialIndex,
    observeSpatialQuery: options.observeSpatialQuery,
  }
  spatialIndexByWorld.set(world, spatialIndex)
  spatialIndexByObstacleList.set(world.obstacles, spatialIndex)
  navigationGraphByWorld.set(world, navigationGraph)
  return world
}

export function findLandrushIslandAmbientWalkablePath(
  world: LandrushIslandAmbientNavigationWorld,
  start: LandrushPoint2,
  target: LandrushPoint2,
): readonly LandrushPoint2[] {
  const search = createLandrushIslandAmbientWalkablePathSearch(world, start, target)
  while (true) {
    const result = advanceLandrushIslandAmbientWalkablePathSearch(search, Number.MAX_SAFE_INTEGER)
    if (result.done) return result.path
  }
}

export function createLandrushIslandAmbientWalkablePathSearch(
  world: LandrushIslandAmbientNavigationWorld,
  start: LandrushPoint2,
  target: LandrushPoint2,
): LandrushIslandAmbientWalkablePathSearch {
  let completedPath: readonly LandrushPoint2[] | null = null
  if (
    !(
      isLandrushIslandAmbientPointWalkable(world, start) &&
      isLandrushIslandAmbientPointWalkable(world, target)
    )
  ) {
    completedPath = []
  } else if (isLandrushIslandAmbientSegmentPassable(world, start, target)) {
    completedPath = [start, target]
  }

  const navigationGraph = completedPath ? undefined : navigationGraphByWorld.get(world)
  const allCandidates = completedPath
    ? EMPTY_NAVIGATION_CANDIDATES
    : (navigationGraph?.candidates ?? compileNavigationCandidates(world))
  const state: LandrushIslandAmbientWalkablePathSearchState = {
    allCandidates,
    completedPath,
    completedAdvanceResult: { done: true, operations: 0, path: completedPath ?? [] },
    currentIndex: -1,
    distances: [],
    navigationGraph,
    phase: completedPath ? 'complete' : 'rank-candidates',
    pendingAdvanceResult: { done: false, operations: 0 },
    pointCount: 0,
    previous: [],
    queryStats: {
      cacheMissCount: 0,
      staticEdgeLookupCount: 0,
    },
    rankedCandidates: [],
    rankingIndex: 0,
    reconstructCopyIndex: 0,
    reconstructIndex: -1,
    reconstructedPath: [],
    reversedPath: [],
    relaxNextIndex: 1,
    selectedCandidateCount: 0,
    selectBestIndex: -1,
    selectBestScore: Number.POSITIVE_INFINITY,
    selectScanIndex: 0,
    sortDestination: [],
    sortLeftEnd: 0,
    sortLeftIndex: 0,
    sortOutputIndex: 0,
    sortRightEnd: 0,
    sortRightIndex: 0,
    sortRunStart: 0,
    sortSource: [],
    sortWidth: 1,
    start,
    target,
    visited: new Uint8Array(0),
    world,
  }
  return state as unknown as LandrushIslandAmbientWalkablePathSearch
}

export function advanceLandrushIslandAmbientWalkablePathSearch(
  search: LandrushIslandAmbientWalkablePathSearch,
  operationBudget: number,
): LandrushIslandAmbientWalkablePathSearchAdvanceResult {
  if (!Number.isSafeInteger(operationBudget) || operationBudget <= 0) {
    throw new RangeError(
      'Ambient walkable path search operation budget must be a positive integer.',
    )
  }

  const state = search as unknown as LandrushIslandAmbientWalkablePathSearchState
  let operations = 0
  while (operations < operationBudget && state.phase !== 'complete') {
    switch (state.phase) {
      case 'rank-candidates': {
        if (state.rankingIndex >= state.allCandidates.length) {
          beginLandrushIslandAmbientCandidateSort(state)
          break
        }
        const candidate = state.allCandidates[state.rankingIndex]
        if (candidate) {
          state.rankedCandidates.push({
            candidate,
            score:
              pointDistance(state.start, candidate.point) +
              pointDistance(candidate.point, state.target),
          })
        }
        state.rankingIndex += 1
        operations += 1
        break
      }
      case 'sort-candidates': {
        if (advanceLandrushIslandAmbientCandidateSort(state)) operations += 1
        break
      }
      case 'select-current': {
        if (state.selectScanIndex >= state.pointCount) {
          finishLandrushIslandAmbientCurrentSelection(state)
          break
        }
        const index = state.selectScanIndex
        state.selectScanIndex += 1
        if (state.visited[index] !== 1) {
          const distance = state.distances[index] ?? Number.POSITIVE_INFINITY
          const score =
            distance + pointDistance(pointForAmbientPathSearch(state, index), state.target)
          if (score < state.selectBestScore) {
            state.selectBestIndex = index
            state.selectBestScore = score
          }
        }
        operations += 1
        break
      }
      case 'relax-neighbors': {
        if (state.relaxNextIndex >= state.pointCount) {
          beginLandrushIslandAmbientCurrentSelection(state)
          break
        }
        relaxNextLandrushIslandAmbientNeighbor(state)
        operations += 1
        break
      }
      case 'reconstruct-backward': {
        reconstructPreviousLandrushIslandAmbientPathPoint(state)
        operations += 1
        break
      }
      case 'reconstruct-forward': {
        reconstructNextLandrushIslandAmbientPathPoint(state)
        operations += 1
        break
      }
    }
  }

  if (state.phase === 'complete') {
    state.completedAdvanceResult.operations = operations
    state.completedAdvanceResult.path = state.completedPath ?? []
    return state.completedAdvanceResult
  }
  state.pendingAdvanceResult.operations = operations
  return state.pendingAdvanceResult
}

function beginLandrushIslandAmbientCandidateSort(
  state: LandrushIslandAmbientWalkablePathSearchState,
) {
  state.sortSource = state.rankedCandidates
  state.sortDestination = new Array<LandrushIslandAmbientNavigationRankedCandidate>(
    state.rankedCandidates.length,
  )
  state.sortWidth = 1
  state.sortRunStart = 0
  if (state.rankedCandidates.length <= 1) {
    beginLandrushIslandAmbientGraphSearch(state)
    return
  }
  initializeLandrushIslandAmbientCandidateSortRun(state)
  state.phase = 'sort-candidates'
}

function advanceLandrushIslandAmbientCandidateSort(
  state: LandrushIslandAmbientWalkablePathSearchState,
) {
  if (state.sortRunStart >= state.sortSource.length) {
    const completedPass = state.sortSource
    state.sortSource = state.sortDestination
    state.sortDestination = completedPass
    state.sortWidth *= 2
    state.sortRunStart = 0
    if (state.sortWidth >= state.sortSource.length) {
      beginLandrushIslandAmbientGraphSearch(state)
      return false
    }
    initializeLandrushIslandAmbientCandidateSortRun(state)
  }

  let next: LandrushIslandAmbientNavigationRankedCandidate
  if (state.sortLeftIndex >= state.sortLeftEnd) {
    next = state.sortSource[state.sortRightIndex]!
    state.sortRightIndex += 1
  } else if (state.sortRightIndex >= state.sortRightEnd) {
    next = state.sortSource[state.sortLeftIndex]!
    state.sortLeftIndex += 1
  } else {
    const left = state.sortSource[state.sortLeftIndex]!
    const right = state.sortSource[state.sortRightIndex]!
    if (left.score <= right.score) {
      next = left
      state.sortLeftIndex += 1
    } else {
      next = right
      state.sortRightIndex += 1
    }
  }
  state.sortDestination[state.sortOutputIndex] = next
  state.sortOutputIndex += 1

  if (state.sortOutputIndex >= state.sortRightEnd) {
    state.sortRunStart = state.sortRightEnd
    if (state.sortRunStart < state.sortSource.length) {
      initializeLandrushIslandAmbientCandidateSortRun(state)
    }
  }
  return true
}

function initializeLandrushIslandAmbientCandidateSortRun(
  state: LandrushIslandAmbientWalkablePathSearchState,
) {
  state.sortLeftIndex = state.sortRunStart
  state.sortLeftEnd = Math.min(state.sortRunStart + state.sortWidth, state.sortSource.length)
  state.sortRightIndex = state.sortLeftEnd
  state.sortRightEnd = Math.min(state.sortRunStart + state.sortWidth * 2, state.sortSource.length)
  state.sortOutputIndex = state.sortRunStart
}

function beginLandrushIslandAmbientGraphSearch(
  state: LandrushIslandAmbientWalkablePathSearchState,
) {
  state.selectedCandidateCount = Math.min(state.sortSource.length, NAVIGATION_MAX_GRAPH_POINTS)
  state.pointCount = state.selectedCandidateCount + 2
  state.distances = new Array<number | undefined>(state.pointCount)
  state.distances[0] = 0
  state.previous = new Array<number | undefined>(state.pointCount)
  state.visited = new Uint8Array(state.pointCount)
  beginLandrushIslandAmbientCurrentSelection(state)
}

function beginLandrushIslandAmbientCurrentSelection(
  state: LandrushIslandAmbientWalkablePathSearchState,
) {
  state.selectBestIndex = -1
  state.selectBestScore = Number.POSITIVE_INFINITY
  state.selectScanIndex = 0
  state.phase = 'select-current'
}

function finishLandrushIslandAmbientCurrentSelection(
  state: LandrushIslandAmbientWalkablePathSearchState,
) {
  const currentIndex = state.selectBestIndex
  if (currentIndex < 0 || !Number.isFinite(state.distances[currentIndex])) {
    completeLandrushIslandAmbientGraphSearch(state, [])
    return
  }
  if (currentIndex === 1) {
    state.reconstructIndex = 1
    state.reversedPath = []
    state.phase = 'reconstruct-backward'
    return
  }

  state.visited[currentIndex] = 1
  state.currentIndex = currentIndex
  state.relaxNextIndex = 1
  state.phase = 'relax-neighbors'
}

function relaxNextLandrushIslandAmbientNeighbor(
  state: LandrushIslandAmbientWalkablePathSearchState,
) {
  const nextIndex = state.relaxNextIndex
  state.relaxNextIndex += 1
  if (state.visited[nextIndex] === 1) return

  const current = pointForAmbientPathSearch(state, state.currentIndex)
  const next = pointForAmbientPathSearch(state, nextIndex)
  const passable =
    state.navigationGraph && state.currentIndex >= 2 && nextIndex >= 2
      ? resolveCachedStaticEdgePassability(
          state.world,
          state.navigationGraph,
          state.sortSource[state.currentIndex - 2]!.candidate,
          state.sortSource[nextIndex - 2]!.candidate,
          state.queryStats,
        )
      : isLandrushIslandAmbientSegmentPassable(state.world, current, next)
  if (!passable) return

  const nextDistance = (state.distances[state.currentIndex] ?? 0) + pointDistance(current, next)
  if (nextDistance >= (state.distances[nextIndex] ?? Number.POSITIVE_INFINITY)) return
  state.distances[nextIndex] = nextDistance
  state.previous[nextIndex] = state.currentIndex
}

function reconstructPreviousLandrushIslandAmbientPathPoint(
  state: LandrushIslandAmbientWalkablePathSearchState,
) {
  const index = state.reconstructIndex
  state.reversedPath.push(pointForAmbientPathSearch(state, index))
  if (index === 0) {
    state.reconstructCopyIndex = 0
    state.reconstructedPath = new Array<LandrushPoint2>(state.reversedPath.length)
    state.phase = 'reconstruct-forward'
    return
  }

  const previousIndex = state.previous[index] ?? -1
  if (previousIndex < 0) {
    completeLandrushIslandAmbientGraphSearch(state, [])
    return
  }
  state.reconstructIndex = previousIndex
}

function reconstructNextLandrushIslandAmbientPathPoint(
  state: LandrushIslandAmbientWalkablePathSearchState,
) {
  state.reconstructedPath[state.reconstructCopyIndex] =
    state.reversedPath[state.reversedPath.length - state.reconstructCopyIndex - 1]!
  state.reconstructCopyIndex += 1
  if (state.reconstructCopyIndex >= state.reconstructedPath.length) {
    completeLandrushIslandAmbientGraphSearch(state, state.reconstructedPath)
  }
}

function completeLandrushIslandAmbientGraphSearch(
  state: LandrushIslandAmbientWalkablePathSearchState,
  path: readonly LandrushPoint2[],
) {
  if (state.navigationGraph) observeNavigationGraphQuery(state.world, state.queryStats)
  state.completedPath = path
  state.phase = 'complete'
}

function pointForAmbientPathSearch(
  state: LandrushIslandAmbientWalkablePathSearchState,
  index: number,
) {
  if (index === 0) return state.start
  if (index === 1) return state.target
  return state.sortSource[index - 2]!.candidate.point
}

export function resolveLandrushIslandAmbientDestination(
  world: LandrushIslandAmbientNavigationWorld,
  seed: string,
  sequence: number,
  preference: LandrushIslandAmbientDestinationPreference,
): LandrushPoint2 | null {
  const bounds = boundsForPoints(world.surfacePoints)
  for (let attempt = 0; attempt < 192; attempt += 1) {
    const xUnit = hashUnit(`${seed}:${sequence}:${attempt}:x`)
    const zUnit = hashUnit(`${seed}:${sequence}:${attempt}:z`)
    const point = {
      x: bounds.minX + (bounds.maxX - bounds.minX) * xUnit,
      z: bounds.minZ + (bounds.maxZ - bounds.minZ) * zUnit,
    }
    if (!isLandrushIslandAmbientPointWalkable(world, point)) continue
    if (distanceToClosedPolyline(point, world.surfacePoints) < 1.1) continue
    if (preference === 'grass' && isLandrushIslandAmbientPointOnRoad(point, world.roads)) continue
    return point
  }
  return null
}

export function isLandrushIslandAmbientPointWalkable(
  world: LandrushIslandAmbientNavigationWorld,
  point: LandrushPoint2,
) {
  if (!pointInPolygonOrNearEdge(point, world.surfacePoints)) return false
  const spatialIndex = spatialIndexByWorld.get(world)
  if (!spatialIndex) {
    return !world.obstacles.some((obstacle) => pointInPolygon(point, obstacle.points))
  }

  const candidates =
    spatialIndex.obstacleCells.get(
      navigationCellKey(
        navigationCellCoordinate(point.x, spatialIndex.cellSize),
        navigationCellCoordinate(point.z, spatialIndex.cellSize),
      ),
    ) ?? EMPTY_CANDIDATE_INDICES
  observeSpatialQuery(spatialIndex, 'obstacle-point', candidates.length, world.obstacles.length)
  for (const obstacleIndex of candidates) {
    const obstacle = world.obstacles[obstacleIndex]
    if (obstacle && pointInPolygon(point, obstacle.points)) return false
  }
  return true
}

export function isLandrushIslandAmbientSegmentPassable(
  world: LandrushIslandAmbientNavigationWorld,
  start: LandrushPoint2,
  end: LandrushPoint2,
) {
  if (
    !(
      isLandrushIslandAmbientPointWalkable(world, start) &&
      isLandrushIslandAmbientPointWalkable(world, end)
    )
  ) {
    return false
  }
  if (!segmentRemainsInSurface(world, start, end)) return false

  const spatialIndex = spatialIndexByWorld.get(world)
  if (!spatialIndex) {
    return !world.obstacles.some((obstacle) =>
      landrushIslandNavigationSegmentIntersectsPolygon(start, end, obstacle.points),
    )
  }

  const candidates = collectSegmentCandidateIndices(
    spatialIndex.obstacleCells,
    start,
    end,
    spatialIndex.cellSize,
  )
  observeSpatialQuery(spatialIndex, 'obstacle-segment', candidates.length, world.obstacles.length)
  for (const obstacleIndex of candidates) {
    const obstacle = world.obstacles[obstacleIndex]
    if (obstacle && landrushIslandNavigationSegmentIntersectsPolygon(start, end, obstacle.points)) {
      return false
    }
  }
  return true
}

export function isLandrushIslandAmbientPointOnRoad(
  point: LandrushPoint2,
  roads: readonly LandrushRoadSegment[],
) {
  for (const road of roads) {
    const threshold = road.width / 2 + GRASS_ROAD_CLEARANCE_METERS
    for (let index = 1; index < road.points.length; index += 1) {
      const start = road.points[index - 1]
      const end = road.points[index]
      if (start && end && distanceToSegment(point, start, end) <= threshold) return true
    }
  }
  return false
}

export function distanceToLandrushIslandAmbientObstacles(
  point: LandrushPoint2,
  obstacles: readonly LandrushIslandAmbientNavigationObstacle[],
) {
  const spatialIndex = spatialIndexByObstacleList.get(obstacles)
  if (spatialIndex) return distanceToIndexedObstacles(point, obstacles, spatialIndex)

  let distance = Number.POSITIVE_INFINITY
  for (const obstacle of obstacles) {
    distance = Math.min(distance, distanceToClosedPolyline(point, obstacle.points))
    if (pointInPolygon(point, obstacle.points)) return 0
  }
  return distance
}

function compileNavigationCandidates(
  world: LandrushIslandAmbientNavigationWorld,
): readonly LandrushIslandAmbientNavigationCandidate[] {
  const points: LandrushPoint2[] = []
  for (const obstacle of world.obstacles) {
    const center = averagePoint(obstacle.points)
    for (const point of openPointRing(obstacle.points)) {
      const direction = normalizePoint(point.x - center.x, point.z - center.z)
      const candidate = {
        x: point.x + direction.x * NAVIGATION_CANDIDATE_OFFSET_METERS,
        z: point.z + direction.z * NAVIGATION_CANDIDATE_OFFSET_METERS,
      }
      if (isLandrushIslandAmbientPointWalkable(world, candidate)) points.push(candidate)
    }
  }

  const surfaceCenter = averagePoint(world.surfacePoints)
  for (const point of openPointRing(world.surfacePoints)) {
    const direction = normalizePoint(surfaceCenter.x - point.x, surfaceCenter.z - point.z)
    const candidate = {
      x: point.x + direction.x * NAVIGATION_CANDIDATE_OFFSET_METERS,
      z: point.z + direction.z * NAVIGATION_CANDIDATE_OFFSET_METERS,
    }
    if (isLandrushIslandAmbientPointWalkable(world, candidate)) points.push(candidate)
  }

  const unique = new Map<string, LandrushPoint2>()
  for (const point of points) unique.set(pointKey(point), point)
  return Object.freeze(
    [...unique.values()].map((point, id) =>
      Object.freeze({
        id,
        point: Object.freeze(point),
      }),
    ),
  )
}

function createNavigationGraph(
  world: LandrushIslandAmbientNavigationWorld,
): LandrushIslandAmbientNavigationGraph {
  return {
    candidates: compileNavigationCandidates(world),
    staticEdgePassability: new Map<number, boolean>(),
  }
}

function resolveCachedStaticEdgePassability(
  world: LandrushIslandAmbientNavigationWorld,
  navigationGraph: LandrushIslandAmbientNavigationGraph,
  first: LandrushIslandAmbientNavigationCandidate,
  second: LandrushIslandAmbientNavigationCandidate,
  queryStats: LandrushIslandAmbientNavigationGraphQueryStats,
) {
  queryStats.staticEdgeLookupCount += 1
  const firstId = Math.min(first.id, second.id)
  const secondId = Math.max(first.id, second.id)
  const cacheKey = firstId * navigationGraph.candidates.length + secondId
  const cached = navigationGraph.staticEdgePassability.get(cacheKey)
  if (cached !== undefined) {
    navigationGraph.staticEdgePassability.delete(cacheKey)
    navigationGraph.staticEdgePassability.set(cacheKey, cached)
    return cached
  }

  queryStats.cacheMissCount += 1
  const passable = isLandrushIslandAmbientSegmentPassable(world, first.point, second.point)
  if (navigationGraph.staticEdgePassability.size >= NAVIGATION_STATIC_EDGE_CACHE_MAX_ENTRIES) {
    const oldestCacheKey = navigationGraph.staticEdgePassability.keys().next().value
    if (oldestCacheKey !== undefined) navigationGraph.staticEdgePassability.delete(oldestCacheKey)
  }
  navigationGraph.staticEdgePassability.set(cacheKey, passable)
  return passable
}

function observeNavigationGraphQuery(
  world: LandrushIslandAmbientNavigationWorld,
  queryStats: LandrushIslandAmbientNavigationGraphQueryStats,
) {
  const spatialIndex = spatialIndexByWorld.get(world)
  if (spatialIndex) {
    observeSpatialQuery(
      spatialIndex,
      'graph-query',
      queryStats.cacheMissCount,
      queryStats.staticEdgeLookupCount,
    )
  }
}

function segmentRemainsInSurface(
  world: LandrushIslandAmbientNavigationWorld,
  start: LandrushPoint2,
  end: LandrushPoint2,
) {
  const surfacePoints = world.surfacePoints
  if (pointsAlmostEqual2(start, end)) return pointInPolygonOrNearEdge(start, surfacePoints)
  for (let sampleIndex = 1; sampleIndex <= 3; sampleIndex += 1) {
    const progress = sampleIndex * 0.25
    if (
      !pointInPolygonOrNearEdge(
        {
          x: start.x + (end.x - start.x) * progress,
          z: start.z + (end.z - start.z) * progress,
        },
        surfacePoints,
      )
    ) {
      return false
    }
  }

  const ring = openPointRing(surfacePoints)
  const spatialIndex = spatialIndexByWorld.get(world)
  if (!spatialIndex) {
    for (let index = 0; index < ring.length; index += 1) {
      const edgeStart = ring[index]
      const edgeEnd = ring[(index + 1) % ring.length]
      if (edgeStart && edgeEnd && segmentCrossesShoreline(start, end, edgeStart, edgeEnd)) {
        return false
      }
    }
    return true
  }

  const candidates = collectSegmentCandidateIndices(
    spatialIndex.shorelineCells,
    start,
    end,
    spatialIndex.cellSize,
  )
  observeSpatialQuery(
    spatialIndex,
    'shoreline-segment',
    candidates.length,
    spatialIndex.shorelineEdges.length,
  )
  for (const edgeIndex of candidates) {
    const edge = spatialIndex.shorelineEdges[edgeIndex]
    if (edge && segmentCrossesShoreline(start, end, edge.start, edge.end)) return false
  }
  return true
}

function segmentCrossesShoreline(
  start: LandrushPoint2,
  end: LandrushPoint2,
  edgeStart: LandrushPoint2,
  edgeEnd: LandrushPoint2,
) {
  if (!segmentsIntersect2(start, end, edgeStart, edgeEnd)) return false
  if (
    pointsAlmostEqual2(start, edgeStart) ||
    pointsAlmostEqual2(start, edgeEnd) ||
    pointsAlmostEqual2(end, edgeStart) ||
    pointsAlmostEqual2(end, edgeEnd)
  ) {
    return false
  }
  return true
}

function createNavigationSpatialIndex(
  world: LandrushIslandAmbientNavigationWorld,
  observeSpatialQueryCallback:
    | ((observation: LandrushIslandAmbientSpatialQueryObservation) => void)
    | undefined,
): LandrushIslandAmbientNavigationSpatialIndex {
  const obstacleCells = new Map<string, number[]>()
  let obstacleCellBounds: LandrushIslandAmbientNavigationCellBounds | null = null
  for (let obstacleIndex = 0; obstacleIndex < world.obstacles.length; obstacleIndex += 1) {
    const obstacle = world.obstacles[obstacleIndex]
    if (!obstacle || obstacle.points.length === 0) continue
    const bounds = boundsForPoints(obstacle.points)
    const minCellX = navigationCellCoordinate(
      bounds.minX - NAVIGATION_SPATIAL_EPSILON_METERS,
      NAVIGATION_SPATIAL_CELL_SIZE_METERS,
    )
    const maxCellX = navigationCellCoordinate(
      bounds.maxX + NAVIGATION_SPATIAL_EPSILON_METERS,
      NAVIGATION_SPATIAL_CELL_SIZE_METERS,
    )
    const minCellZ = navigationCellCoordinate(
      bounds.minZ - NAVIGATION_SPATIAL_EPSILON_METERS,
      NAVIGATION_SPATIAL_CELL_SIZE_METERS,
    )
    const maxCellZ = navigationCellCoordinate(
      bounds.maxZ + NAVIGATION_SPATIAL_EPSILON_METERS,
      NAVIGATION_SPATIAL_CELL_SIZE_METERS,
    )
    obstacleCellBounds = mergeNavigationCellBounds(obstacleCellBounds, {
      maxCellX,
      maxCellZ,
      minCellX,
      minCellZ,
    })
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        addNavigationCellCandidate(obstacleCells, cellX, cellZ, obstacleIndex)
      }
    }
  }

  const shorelineCells = new Map<string, number[]>()
  const shorelineEdges: LandrushIslandAmbientNavigationShorelineEdge[] = []
  const surfaceRing = openPointRing(world.surfacePoints)
  for (let index = 0; index < surfaceRing.length; index += 1) {
    const start = surfaceRing[index]
    const end = surfaceRing[(index + 1) % surfaceRing.length]
    if (!start || !end) continue
    const edgeIndex = shorelineEdges.length
    shorelineEdges.push(Object.freeze({ end, start }))
    for (const key of collectSegmentCellKeys(start, end, NAVIGATION_SPATIAL_CELL_SIZE_METERS)) {
      const candidates = shorelineCells.get(key)
      if (candidates) candidates.push(edgeIndex)
      else shorelineCells.set(key, [edgeIndex])
    }
  }

  return Object.freeze({
    cellSize: NAVIGATION_SPATIAL_CELL_SIZE_METERS,
    obstacleCellBounds: obstacleCellBounds ? Object.freeze(obstacleCellBounds) : null,
    obstacleCells: freezeNavigationCellMap(obstacleCells),
    observeSpatialQuery: observeSpatialQueryCallback,
    shorelineCells: freezeNavigationCellMap(shorelineCells),
    shorelineEdges: Object.freeze(shorelineEdges),
  })
}

function distanceToIndexedObstacles(
  point: LandrushPoint2,
  obstacles: readonly LandrushIslandAmbientNavigationObstacle[],
  spatialIndex: LandrushIslandAmbientNavigationSpatialIndex,
) {
  const occupiedBounds = spatialIndex.obstacleCellBounds
  if (!occupiedBounds) {
    observeSpatialQuery(spatialIndex, 'obstacle-distance', 0, obstacles.length)
    return Number.POSITIVE_INFINITY
  }

  const pointCellX = navigationCellCoordinate(point.x, spatialIndex.cellSize)
  const pointCellZ = navigationCellCoordinate(point.z, spatialIndex.cellSize)
  const maximumRadius = Math.max(
    Math.abs(pointCellX - occupiedBounds.minCellX),
    Math.abs(pointCellX - occupiedBounds.maxCellX),
    Math.abs(pointCellZ - occupiedBounds.minCellZ),
    Math.abs(pointCellZ - occupiedBounds.maxCellZ),
  )
  const inspectedObstacles = new Set<number>()
  let distance = Number.POSITIVE_INFINITY

  for (let radius = 0; radius <= maximumRadius; radius += 1) {
    forEachNavigationCellInRing(pointCellX, pointCellZ, radius, (cellX, cellZ) => {
      const candidates = spatialIndex.obstacleCells.get(navigationCellKey(cellX, cellZ))
      if (!candidates) return
      for (const obstacleIndex of candidates) {
        if (inspectedObstacles.has(obstacleIndex)) continue
        inspectedObstacles.add(obstacleIndex)
        const obstacle = obstacles[obstacleIndex]
        if (!obstacle) continue
        distance = Math.min(distance, distanceToClosedPolyline(point, obstacle.points))
        if (pointInPolygon(point, obstacle.points)) distance = 0
      }
    })

    if (
      distance <=
      minimumDistanceToOutsideNavigationCellRing(
        point,
        pointCellX,
        pointCellZ,
        radius,
        spatialIndex.cellSize,
      )
    ) {
      break
    }
  }

  observeSpatialQuery(spatialIndex, 'obstacle-distance', inspectedObstacles.size, obstacles.length)
  return distance
}

function collectSegmentCandidateIndices(
  cells: ReadonlyMap<string, readonly number[]>,
  start: LandrushPoint2,
  end: LandrushPoint2,
  cellSize: number,
) {
  const candidates = new Set<number>()
  for (const key of collectSegmentCellKeys(start, end, cellSize)) {
    const cellCandidates = cells.get(key)
    if (!cellCandidates) continue
    for (const candidate of cellCandidates) candidates.add(candidate)
  }
  return [...candidates].sort((first, second) => first - second)
}

function collectSegmentCellKeys(start: LandrushPoint2, end: LandrushPoint2, cellSize: number) {
  const keys = new Set<string>()
  const addIntersectingNeighborhood = (cellX: number, cellZ: number) => {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
        const candidateCellX = cellX + offsetX
        const candidateCellZ = cellZ + offsetZ
        if (segmentIntersectsNavigationCell(start, end, candidateCellX, candidateCellZ, cellSize)) {
          keys.add(navigationCellKey(candidateCellX, candidateCellZ))
        }
      }
    }
  }

  let cellX = navigationCellCoordinate(start.x, cellSize)
  let cellZ = navigationCellCoordinate(start.z, cellSize)
  const endCellX = navigationCellCoordinate(end.x, cellSize)
  const endCellZ = navigationCellCoordinate(end.z, cellSize)
  addIntersectingNeighborhood(cellX, cellZ)
  if (cellX === endCellX && cellZ === endCellZ) return [...keys]

  const deltaX = end.x - start.x
  const deltaZ = end.z - start.z
  const stepX = Math.sign(deltaX)
  const stepZ = Math.sign(deltaZ)
  const deltaProgressX = stepX === 0 ? Number.POSITIVE_INFINITY : cellSize / Math.abs(deltaX)
  const deltaProgressZ = stepZ === 0 ? Number.POSITIVE_INFINITY : cellSize / Math.abs(deltaZ)
  const nextBoundaryX = (cellX + (stepX > 0 ? 1 : 0)) * cellSize
  const nextBoundaryZ = (cellZ + (stepZ > 0 ? 1 : 0)) * cellSize
  let nextProgressX = stepX === 0 ? Number.POSITIVE_INFINITY : (nextBoundaryX - start.x) / deltaX
  let nextProgressZ = stepZ === 0 ? Number.POSITIVE_INFINITY : (nextBoundaryZ - start.z) / deltaZ
  const maximumSteps = Math.abs(endCellX - cellX) + Math.abs(endCellZ - cellZ) + 4

  for (let step = 0; step < maximumSteps && (cellX !== endCellX || cellZ !== endCellZ); step += 1) {
    if (nextProgressX < nextProgressZ - Number.EPSILON) {
      cellX += stepX
      nextProgressX += deltaProgressX
    } else if (nextProgressZ < nextProgressX - Number.EPSILON) {
      cellZ += stepZ
      nextProgressZ += deltaProgressZ
    } else {
      cellX += stepX
      cellZ += stepZ
      nextProgressX += deltaProgressX
      nextProgressZ += deltaProgressZ
    }
    addIntersectingNeighborhood(cellX, cellZ)
  }
  return [...keys]
}

function segmentIntersectsNavigationCell(
  start: LandrushPoint2,
  end: LandrushPoint2,
  cellX: number,
  cellZ: number,
  cellSize: number,
) {
  let minimumProgress = 0
  let maximumProgress = 1
  const deltaX = end.x - start.x
  const deltaZ = end.z - start.z
  const minX = cellX * cellSize - NAVIGATION_SPATIAL_EPSILON_METERS
  const maxX = (cellX + 1) * cellSize + NAVIGATION_SPATIAL_EPSILON_METERS
  const minZ = cellZ * cellSize - NAVIGATION_SPATIAL_EPSILON_METERS
  const maxZ = (cellZ + 1) * cellSize + NAVIGATION_SPATIAL_EPSILON_METERS

  if (Math.abs(deltaX) <= Number.EPSILON) {
    if (!(start.x >= minX && start.x <= maxX)) return false
  } else {
    const first = (minX - start.x) / deltaX
    const second = (maxX - start.x) / deltaX
    const clippedMaximum = Math.max(first, second)
    const clippedMinimum = Math.min(first, second)
    minimumProgress = Math.max(minimumProgress, clippedMinimum)
    maximumProgress = Math.min(maximumProgress, clippedMaximum)
  }
  if (minimumProgress > maximumProgress) return false

  if (Math.abs(deltaZ) <= Number.EPSILON) {
    if (!(start.z >= minZ && start.z <= maxZ)) return false
  } else {
    const first = (minZ - start.z) / deltaZ
    const second = (maxZ - start.z) / deltaZ
    const clippedMaximum = Math.max(first, second)
    const clippedMinimum = Math.min(first, second)
    minimumProgress = Math.max(minimumProgress, clippedMinimum)
    maximumProgress = Math.min(maximumProgress, clippedMaximum)
  }
  return minimumProgress <= maximumProgress
}

function forEachNavigationCellInRing(
  centerX: number,
  centerZ: number,
  radius: number,
  visit: (cellX: number, cellZ: number) => void,
) {
  if (radius === 0) {
    visit(centerX, centerZ)
    return
  }
  const minX = centerX - radius
  const maxX = centerX + radius
  const minZ = centerZ - radius
  const maxZ = centerZ + radius
  for (let cellX = minX; cellX <= maxX; cellX += 1) {
    visit(cellX, minZ)
    visit(cellX, maxZ)
  }
  for (let cellZ = minZ + 1; cellZ < maxZ; cellZ += 1) {
    visit(minX, cellZ)
    visit(maxX, cellZ)
  }
}

function minimumDistanceToOutsideNavigationCellRing(
  point: LandrushPoint2,
  centerCellX: number,
  centerCellZ: number,
  radius: number,
  cellSize: number,
) {
  const minimumX = (centerCellX - radius) * cellSize
  const maximumX = (centerCellX + radius + 1) * cellSize
  const minimumZ = (centerCellZ - radius) * cellSize
  const maximumZ = (centerCellZ + radius + 1) * cellSize
  return Math.max(
    0,
    Math.min(point.x - minimumX, maximumX - point.x, point.z - minimumZ, maximumZ - point.z),
  )
}

function addNavigationCellCandidate(
  cells: Map<string, number[]>,
  cellX: number,
  cellZ: number,
  candidate: number,
) {
  const key = navigationCellKey(cellX, cellZ)
  const candidates = cells.get(key)
  if (candidates) candidates.push(candidate)
  else cells.set(key, [candidate])
}

function freezeNavigationCellMap(cells: Map<string, number[]>) {
  const frozenCells = new Map<string, readonly number[]>()
  for (const [key, candidates] of cells) {
    frozenCells.set(key, Object.freeze(candidates))
  }
  return frozenCells
}

function mergeNavigationCellBounds(
  current: LandrushIslandAmbientNavigationCellBounds | null,
  next: LandrushIslandAmbientNavigationCellBounds,
): LandrushIslandAmbientNavigationCellBounds {
  if (!current) return next
  return {
    maxCellX: Math.max(current.maxCellX, next.maxCellX),
    maxCellZ: Math.max(current.maxCellZ, next.maxCellZ),
    minCellX: Math.min(current.minCellX, next.minCellX),
    minCellZ: Math.min(current.minCellZ, next.minCellZ),
  }
}

function observeSpatialQuery(
  spatialIndex: LandrushIslandAmbientNavigationSpatialIndex,
  kind: LandrushIslandAmbientSpatialQueryKind,
  candidateCount: number,
  totalCount: number,
) {
  if (spatialIndex.observeSpatialQuery) {
    spatialIndex.observeSpatialQuery({ candidateCount, kind, totalCount })
  }
}

function navigationCellCoordinate(value: number, cellSize: number) {
  return Math.floor(value / cellSize)
}

function navigationCellKey(cellX: number, cellZ: number) {
  return `${cellX}:${cellZ}`
}

function freezePoints(points: readonly LandrushPoint2[]) {
  return Object.freeze(points.map((point) => Object.freeze({ x: point.x, z: point.z })))
}

function boundsForPoints(points: readonly LandrushPoint2[]) {
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minZ = Math.min(minZ, point.z)
    maxX = Math.max(maxX, point.x)
    maxZ = Math.max(maxZ, point.z)
  }
  return { maxX, maxZ, minX, minZ }
}

function distanceToClosedPolyline(point: LandrushPoint2, points: readonly LandrushPoint2[]) {
  let distance = Number.POSITIVE_INFINITY
  const ring = openPointRing(points)
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index]
    const end = ring[(index + 1) % ring.length]
    if (start && end) distance = Math.min(distance, distanceToSegment(point, start, end))
  }
  return distance
}

function distanceToSegment(point: LandrushPoint2, start: LandrushPoint2, end: LandrushPoint2) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared <= 0.000_001) return pointDistance(point, start)
  const progress = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared),
  )
  return Math.hypot(point.x - (start.x + dx * progress), point.z - (start.z + dz * progress))
}

function normalizePoint(x: number, z: number) {
  const length = Math.hypot(x, z)
  return length <= 0.000_001 ? { x: 1, z: 0 } : { x: x / length, z: z / length }
}

function averagePoint(points: readonly LandrushPoint2[]) {
  if (points.length === 0) return { x: 0, z: 0 }
  const sum = points.reduce((total, point) => ({ x: total.x + point.x, z: total.z + point.z }), {
    x: 0,
    z: 0,
  })
  return { x: sum.x / points.length, z: sum.z / points.length }
}

function pointDistance(first: LandrushPoint2, second: LandrushPoint2) {
  return Math.hypot(second.x - first.x, second.z - first.z)
}

function pointKey(point: LandrushPoint2) {
  return `${Math.round(point.x * 100)}:${Math.round(point.z * 100)}`
}

function hashUnit(value: string) {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0) / 4_294_967_296
}
