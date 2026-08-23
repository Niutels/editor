const DEFAULT_NAVIGATION_CELL_SIZE_METERS = 0.25
const DEFAULT_BROADPHASE_CELL_SIZE_METERS = 2
const FLOW_TARGET_CELL_STRIDE = 2
const FLOW_UNREACHABLE = 0xffff_ffff
const FLOW_STRICT_UNBUILT = -2
const FLOW_FALLBACK_UNBUILT = -2
const COLLISION_EPSILON_METERS = 0.000_5
const COLLISION_SWEEP_ITERATIONS = 3
const INTERSECTION_EPSILON = 0.000_000_1
const NAVIGATION_CONNECTOR_ENTRY_HEIGHT_TOLERANCE_METERS = 0.35
const NAVIGATION_CONNECTOR_TARGET_LANDING_TOLERANCE_METERS = 0.4
const NAVIGATION_SUPPORT_ELEVATION_TOLERANCE_METERS = 0.12
const NAVIGATION_AGENT_HEIGHT_METERS = 1.8

const FLOW_NEIGHBOR_X = new Int8Array([0, 1, 0, -1, 1, 1, -1, -1])
const FLOW_NEIGHBOR_Z = new Int8Array([-1, 0, 1, 0, -1, 1, 1, -1])

type GridAabbBounds = Readonly<{
  maximumColumn: number
  maximumRow: number
  minimumColumn: number
  minimumRow: number
}>

type CollisionAabbBounds = Readonly<{
  maximumX: number
  maximumZ: number
  minimumX: number
  minimumZ: number
}>

export type ZombieEscapeCollisionEndCap = 'flat' | 'round'
export type ZombieEscapeCollisionBoundaryPolicy = 'none' | 'solid'

export type ZombieEscapeCollisionCircleSource = Readonly<{
  breakable?: boolean
  id: string
  maximumY?: number
  minimumY?: number
  navigationLayerY?: number
  objectId?: string
  radius: number
  x: number
  z: number
}>

export type ZombieEscapeCollisionSegmentSource = Readonly<{
  breakable?: boolean
  endCap?: ZombieEscapeCollisionEndCap
  endX: number
  endZ: number
  halfThickness: number
  id: string
  maximumY?: number
  minimumY?: number
  navigationLayerY?: number
  objectId?: string
  startCap?: ZombieEscapeCollisionEndCap
  startX: number
  startZ: number
}>

export type ZombieEscapeCollisionBoxSource = Readonly<{
  breakable?: boolean
  centerX: number
  centerZ: number
  halfDepth: number
  halfWidth: number
  id: string
  maximumY?: number
  minimumY?: number
  navigationLayerY?: number
  objectId?: string
  rotation: number
}>

export type ZombieEscapeNavigationConnectorSource = Readonly<{
  ascendingEnd: boolean
  chainId: string
  chainLowerY: number
  chainOrder: number
  chainUpperY: number
  endX: number
  endY: number
  endZ: number
  halfWidth: number
  id: string
  objectId?: string
  startX: number
  startY: number
  startZ: number
}>

export type ZombieEscapeNavigationSupportSource = Readonly<{
  elevation: number
  holes?: readonly (readonly Readonly<{ x: number; z: number }>[])[]
  id: string
  polygon: readonly Readonly<{ x: number; z: number }>[]
}>

export type ZombieEscapeCollisionCircle = Readonly<{
  breakable: boolean
  id: string
  maximumY: number
  minimumY: number
  navigationLayerY: number
  objectId: string
  radius: number
  x: number
  z: number
}>

export type ZombieEscapeCollisionSegment = Readonly<{
  breakable: boolean
  endCap: ZombieEscapeCollisionEndCap
  endX: number
  endZ: number
  halfThickness: number
  id: string
  maximumY: number
  minimumY: number
  navigationLayerY: number
  objectId: string
  startCap: ZombieEscapeCollisionEndCap
  startX: number
  startZ: number
}>

export type ZombieEscapeCollisionBox = Readonly<{
  breakable: boolean
  centerX: number
  centerZ: number
  cosine: number
  halfDepth: number
  halfWidth: number
  id: string
  maximumY: number
  minimumY: number
  navigationLayerY: number
  objectId: string
  rotation: number
  sine: number
}>

export type ZombieEscapeNavigationConnector = Readonly<{
  ascendingEnd: boolean
  chainId: string
  chainLowerY: number
  chainOrder: number
  chainUpperY: number
  directionX: number
  directionZ: number
  endCell: number
  endLayerIndex: number
  endX: number
  endY: number
  endZ: number
  halfWidth: number
  id: string
  length: number
  objectId: string
  startCell: number
  startLayerIndex: number
  startX: number
  startY: number
  startZ: number
}>

type ZombieEscapeNavigationConnectorEdge = Readonly<{
  fromNode: number
  toNode: number
}>

export type ZombieEscapeNavigationConnectorAdjacency = Readonly<{
  nodeOffsets: Uint32Array
  toNodes: Int32Array
}>

export type ZombieEscapeNavigationLayer = Readonly<{
  breakableOpenOccupancy: Uint8Array
  elevation: number
  occupancy: Uint8Array
  support: Uint8Array
}>

export type ZombieEscapeCollisionBroadphase = Readonly<{
  cellOffsets: Uint32Array
  cellSize: number
  colliderIndices: Uint32Array
  gridHeight: number
  gridOriginX: number
  gridOriginZ: number
  gridWidth: number
  visitEpoch: Uint32Array
  visitStamps: Uint32Array
}>

export type ZombieEscapeCollisionWorld = Readonly<{
  agentRadius: number
  boundaryPolicy: ZombieEscapeCollisionBoundaryPolicy
  boxes: readonly ZombieEscapeCollisionBox[]
  breakableObjectIds: ReadonlySet<string>
  broadphase: ZombieEscapeCollisionBroadphase
  cellSize: number
  circles: readonly ZombieEscapeCollisionCircle[]
  gridHeight: number
  gridOriginX: number
  gridOriginZ: number
  gridWidth: number
  playRadius: number
  navigationConnectorAdjacency: ZombieEscapeNavigationConnectorAdjacency
  navigationConnectors: readonly ZombieEscapeNavigationConnector[]
  navigationLayers: readonly ZombieEscapeNavigationLayer[]
  navigationSupports: readonly ZombieEscapeNavigationSupportSource[]
  revision: string
  segments: readonly ZombieEscapeCollisionSegment[]
  semanticKey: string
}>

export type ZombieEscapeFlowField = {
  distances: Uint32Array
  fallbackDistances: Uint32Array
  fallbackQueue: Int32Array
  fallbackReachableCount: number
  fallbackRebuildCount: number
  fallbackTargetCell: number
  queue: Int32Array
  reachableCount: number
  rebuildCount: number
  targetBucketX: number
  targetBucketZ: number
  targetCell: number
  targetLayerIndex: number
  targetX: number
  targetY: number
  targetZ: number
  world: ZombieEscapeCollisionWorld
}

export type ZombieEscapeFlowSample = {
  blockingDistance: number
  blockingX: number
  blockingZ: number
  reachable: boolean
  x: number
  z: number
}

export type ZombieEscapeReachableSpawn = {
  cell: number
  reachable: boolean
  x: number
  z: number
}

export type ZombieEscapeCollisionHit = {
  colliderIndex: number
  colliderKind: 'boundary' | 'box' | 'circle' | 'none' | 'segment'
  normalX: number
  normalY: number
  normalZ: number
  time: number
}

export type ZombieEscapeCircleMoveResult = {
  collided: boolean
  x: number
  z: number
}

export type ZombieEscapeNavigationMoveResult = ZombieEscapeCircleMoveResult & {
  connectorIndex: number
  connectorTargetEnd: boolean
  y: number
}

export function createZombieEscapeCollisionWorld({
  agentRadius,
  boundaryPolicy = 'solid',
  boxes = [],
  broadphaseCellSize = DEFAULT_BROADPHASE_CELL_SIZE_METERS,
  cellSize = DEFAULT_NAVIGATION_CELL_SIZE_METERS,
  circles = [],
  navigationConnectors = [],
  navigationSupports = [],
  playRadius,
  segments = [],
}: {
  agentRadius: number
  boundaryPolicy?: ZombieEscapeCollisionBoundaryPolicy
  boxes?: readonly ZombieEscapeCollisionBoxSource[]
  broadphaseCellSize?: number
  cellSize?: number
  circles?: readonly ZombieEscapeCollisionCircleSource[]
  navigationConnectors?: readonly ZombieEscapeNavigationConnectorSource[]
  navigationSupports?: readonly ZombieEscapeNavigationSupportSource[]
  playRadius: number
  segments?: readonly ZombieEscapeCollisionSegmentSource[]
}): ZombieEscapeCollisionWorld {
  const resolvedCellSize = finitePositive(cellSize, DEFAULT_NAVIGATION_CELL_SIZE_METERS)
  const resolvedBroadphaseCellSize = finitePositive(
    broadphaseCellSize,
    DEFAULT_BROADPHASE_CELL_SIZE_METERS,
  )
  const resolvedPlayRadius = finitePositive(playRadius, 1)
  const resolvedAgentRadius = Math.max(0, finiteNonNegative(agentRadius, 0.25))
  const resolvedBoundaryPolicy = boundaryPolicy === 'none' ? 'none' : 'solid'
  const normalizedConnectors = navigationConnectors
    .filter(isFiniteNavigationConnector)
    .map(normalizeNavigationConnector)
    .sort(compareNavigationConnectors)
  const normalizedSupports = navigationSupports
    .filter(isFiniteNavigationSupport)
    .map(normalizeNavigationSupport)
    .sort(
      (first, second) => first.elevation - second.elevation || first.id.localeCompare(second.id),
    )
  const sortedCircles = circles
    .filter(isFiniteCircle)
    .map(normalizeCircle)
    .sort(compareCollisionCircles)
  const sortedBoxes = boxes.filter(isFiniteBox).map(normalizeBox).sort(compareCollisionBoxes)
  const sortedSegments = segments
    .filter(isFiniteSegment)
    .map(normalizeSegment)
    .sort(compareCollisionSegments)
  const gridWidth = Math.max(1, Math.ceil((resolvedPlayRadius * 2) / resolvedCellSize))
  const gridHeight = gridWidth
  const gridOriginX = -(gridWidth * resolvedCellSize) / 2
  const gridOriginZ = -(gridHeight * resolvedCellSize) / 2
  const navigationLayers = createNavigationLayers(
    resolvedPlayRadius,
    resolvedAgentRadius,
    gridWidth,
    gridHeight,
    gridOriginX,
    gridOriginZ,
    resolvedCellSize,
    sortedBoxes,
    sortedCircles,
    sortedSegments,
    normalizedSupports,
  )

  const navigationConnectorsWithCells = resolveNavigationConnectorCells(
    normalizedConnectors,
    navigationLayers,
    gridWidth,
    gridHeight,
    gridOriginX,
    gridOriginZ,
    resolvedCellSize,
    resolvedAgentRadius,
  )
  const navigationConnectorAdjacency = createNavigationConnectorAdjacency(
    navigationConnectorsWithCells,
    gridWidth * gridHeight,
    gridWidth * gridHeight * navigationLayers.length + normalizedConnectors.length * 2,
  )

  const semanticKey = createCollisionWorldSemanticKey(
    resolvedPlayRadius,
    resolvedBoundaryPolicy,
    resolvedAgentRadius,
    resolvedCellSize,
    resolvedBroadphaseCellSize,
    sortedBoxes,
    sortedCircles,
    sortedSegments,
    navigationConnectorsWithCells,
    normalizedSupports,
  )
  return {
    agentRadius: resolvedAgentRadius,
    boundaryPolicy: resolvedBoundaryPolicy,
    boxes: sortedBoxes,
    breakableObjectIds: new Set(
      [...sortedBoxes, ...sortedCircles, ...sortedSegments]
        .filter((collider) => collider.breakable)
        .map((collider) => collider.objectId),
    ),
    broadphase: createCollisionBroadphase(
      resolvedPlayRadius,
      resolvedBoundaryPolicy,
      resolvedBroadphaseCellSize,
      sortedBoxes,
      sortedCircles,
      sortedSegments,
    ),
    cellSize: resolvedCellSize,
    circles: sortedCircles,
    gridHeight,
    gridOriginX,
    gridOriginZ,
    gridWidth,
    playRadius: resolvedPlayRadius,
    navigationConnectorAdjacency,
    navigationConnectors: navigationConnectorsWithCells,
    navigationLayers,
    navigationSupports: normalizedSupports,
    revision: hashSemanticKey(semanticKey),
    segments: sortedSegments,
    semanticKey,
  }
}

export function createZombieEscapeCollisionWorldWithoutObjects(
  world: ZombieEscapeCollisionWorld,
  removedObjectIds: ReadonlySet<string>,
) {
  if (removedObjectIds.size === 0) return world
  const circles = world.circles.filter((circle) => !removedObjectIds.has(circle.objectId))
  const boxes = world.boxes.filter((box) => !removedObjectIds.has(box.objectId))
  const segments = world.segments.filter((segment) => !removedObjectIds.has(segment.objectId))
  const navigationConnectors = world.navigationConnectors.filter(
    (connector) => !removedObjectIds.has(connector.objectId),
  )
  if (
    boxes.length === world.boxes.length &&
    circles.length === world.circles.length &&
    segments.length === world.segments.length &&
    navigationConnectors.length === world.navigationConnectors.length
  ) {
    return world
  }
  return createZombieEscapeCollisionWorld({
    agentRadius: world.agentRadius,
    boundaryPolicy: world.boundaryPolicy,
    boxes,
    broadphaseCellSize: world.broadphase.cellSize,
    cellSize: world.cellSize,
    circles,
    navigationConnectors,
    navigationSupports: world.navigationSupports,
    playRadius: world.playRadius,
    segments,
  })
}

export function resolveZombieEscapeCollisionHitObjectId(
  world: ZombieEscapeCollisionWorld,
  hit: ZombieEscapeCollisionHit,
) {
  if (hit.colliderKind === 'box') return world.boxes[hit.colliderIndex]?.objectId ?? null
  if (hit.colliderKind === 'circle') return world.circles[hit.colliderIndex]?.objectId ?? null
  if (hit.colliderKind === 'segment') return world.segments[hit.colliderIndex]?.objectId ?? null
  return null
}

export function isZombieEscapeCollisionHitBreakable(
  world: ZombieEscapeCollisionWorld,
  hit: ZombieEscapeCollisionHit,
): boolean {
  const collider =
    hit.colliderKind === 'box'
      ? world.boxes[hit.colliderIndex]
      : hit.colliderKind === 'circle'
        ? world.circles[hit.colliderIndex]
        : hit.colliderKind === 'segment'
          ? world.segments[hit.colliderIndex]
          : null
  return collider?.breakable === true
}

export function isZombieEscapeCollisionObjectBreakable(
  world: ZombieEscapeCollisionWorld,
  objectId: string,
) {
  return world.breakableObjectIds.has(objectId)
}

export function isZombieEscapeCollisionObjectBreakableAtElevation(
  world: ZombieEscapeCollisionWorld,
  objectId: string,
  elevation: number,
) {
  const layer = world.navigationLayers[resolveNavigationLayerIndex(world, elevation)]
  if (!layer) return false
  for (const colliders of [world.boxes, world.circles, world.segments]) {
    if (
      colliders.some(
        (collider) =>
          collider.breakable &&
          collider.objectId === objectId &&
          colliderVerticalRangeBlocksNavigationElevation(collider, layer.elevation),
      )
    ) {
      return true
    }
  }
  return false
}

export function createZombieEscapeFlowField(
  world: ZombieEscapeCollisionWorld,
): ZombieEscapeFlowField {
  const nodeCount = navigationNodeCount(world)
  const distances = new Uint32Array(nodeCount)
  distances.fill(FLOW_UNREACHABLE)
  return {
    distances,
    fallbackDistances: new Uint32Array(nodeCount).fill(FLOW_UNREACHABLE),
    fallbackQueue: new Int32Array(nodeCount),
    fallbackReachableCount: 0,
    fallbackRebuildCount: 0,
    fallbackTargetCell: FLOW_FALLBACK_UNBUILT,
    queue: new Int32Array(nodeCount),
    reachableCount: 0,
    rebuildCount: 0,
    targetBucketX: -1,
    targetBucketZ: -1,
    targetCell: -1,
    targetLayerIndex: -1,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    world,
  }
}

export function setZombieEscapeFlowFieldWorld(
  field: ZombieEscapeFlowField,
  world: ZombieEscapeCollisionWorld,
) {
  if (field.world.semanticKey === world.semanticKey) return false
  field.world = world
  const nodeCount = navigationNodeCount(world)
  field.distances = new Uint32Array(nodeCount)
  field.distances.fill(FLOW_UNREACHABLE)
  field.fallbackDistances = new Uint32Array(nodeCount)
  field.fallbackDistances.fill(FLOW_UNREACHABLE)
  field.fallbackQueue = new Int32Array(nodeCount)
  field.fallbackReachableCount = 0
  field.fallbackTargetCell = FLOW_FALLBACK_UNBUILT
  field.queue = new Int32Array(nodeCount)
  field.reachableCount = 0
  field.targetBucketX = -1
  field.targetBucketZ = -1
  field.targetCell = -1
  field.targetLayerIndex = -1
  field.targetX = 0
  field.targetY = 0
  field.targetZ = 0
  return true
}

export function updateZombieEscapeFlowTarget(
  field: ZombieEscapeFlowField,
  targetX: number,
  targetZ: number,
  targetY = 0,
) {
  const world = field.world
  const targetColumn = worldColumn(world, targetX)
  const targetRow = worldRow(world, targetZ)
  const targetBucketX = Math.floor(targetColumn / FLOW_TARGET_CELL_STRIDE)
  const targetBucketZ = Math.floor(targetRow / FLOW_TARGET_CELL_STRIDE)
  const targetLayerIndex = resolveSupportedNavigationLayerIndex(world, targetX, targetZ, targetY)
  if (
    field.targetLayerIndex >= 0 &&
    field.targetBucketX === targetBucketX &&
    field.targetBucketZ === targetBucketZ &&
    field.targetLayerIndex === targetLayerIndex
  ) {
    return false
  }

  field.targetBucketX = targetBucketX
  field.targetBucketZ = targetBucketZ
  field.targetCell = FLOW_STRICT_UNBUILT
  field.targetLayerIndex = targetLayerIndex
  field.targetX = targetX
  field.targetY = targetY
  field.targetZ = targetZ
  field.reachableCount = 0
  field.fallbackReachableCount = 0
  field.fallbackTargetCell = FLOW_FALLBACK_UNBUILT
  return true
}

function ensureZombieEscapeStrictFlowTarget(field: ZombieEscapeFlowField) {
  if (field.targetLayerIndex < 0 || field.targetCell !== FLOW_STRICT_UNBUILT) return
  const world = field.world
  const targetCell = findNearestWalkableCell(
    world,
    field.targetLayerIndex,
    worldColumn(world, field.targetX),
    worldRow(world, field.targetZ),
  )
  field.distances.fill(FLOW_UNREACHABLE)
  field.reachableCount = 0
  field.targetCell = targetCell
  field.rebuildCount += 1
  if (targetCell < 0) return
  field.reachableCount = rebuildZombieEscapeFlowDistances(
    world,
    field.distances,
    field.queue,
    field.targetLayerIndex,
    targetCell,
    false,
  )
}

function ensureZombieEscapeFallbackFlowTarget(field: ZombieEscapeFlowField) {
  if (field.fallbackTargetCell !== FLOW_FALLBACK_UNBUILT) return
  const world = field.world
  const targetCell = findNearestWalkableCell(
    world,
    field.targetLayerIndex,
    worldColumn(world, field.targetX),
    worldRow(world, field.targetZ),
    true,
  )
  field.fallbackDistances.fill(FLOW_UNREACHABLE)
  field.fallbackReachableCount = 0
  field.fallbackTargetCell = targetCell
  field.fallbackRebuildCount += 1
  if (targetCell < 0) return
  field.fallbackReachableCount = rebuildZombieEscapeFlowDistances(
    world,
    field.fallbackDistances,
    field.fallbackQueue,
    field.targetLayerIndex,
    targetCell,
    true,
  )
}

function rebuildZombieEscapeFlowDistances(
  world: ZombieEscapeCollisionWorld,
  distances: Uint32Array,
  queue: Int32Array,
  targetLayerIndex: number,
  targetCell: number,
  breakablesTraversable: boolean,
) {
  let readIndex = 0
  let writeIndex = 0
  const targetNode = navigationNode(world, targetLayerIndex, targetCell)
  queue[writeIndex++] = targetNode
  distances[targetNode] = 0
  while (readIndex < writeIndex) {
    const node = queue[readIndex++]!
    const distance = distances[node]!
    if (isGridNavigationNode(world, node)) {
      const layerIndex = navigationNodeLayerIndex(world, node)
      const cell = navigationNodeCell(world, node)
      const column = cell % world.gridWidth
      const row = Math.floor(cell / world.gridWidth)
      for (let neighbor = 0; neighbor < FLOW_NEIGHBOR_X.length; neighbor += 1) {
        const columnOffset = FLOW_NEIGHBOR_X[neighbor]!
        const rowOffset = FLOW_NEIGHBOR_Z[neighbor]!
        const nextColumn = column + columnOffset
        const nextRow = row + rowOffset
        if (!isGridCellWalkable(world, layerIndex, nextColumn, nextRow, breakablesTraversable)) {
          continue
        }
        if (
          columnOffset !== 0 &&
          rowOffset !== 0 &&
          (!isGridCellWalkable(
            world,
            layerIndex,
            column + columnOffset,
            row,
            breakablesTraversable,
          ) ||
            !isGridCellWalkable(world, layerIndex, column, row + rowOffset, breakablesTraversable))
        ) {
          continue
        }
        const nextCell = nextRow * world.gridWidth + nextColumn
        const nextNode = navigationNode(world, layerIndex, nextCell)
        if (distances[nextNode] !== FLOW_UNREACHABLE) continue
        distances[nextNode] = distance + 1
        queue[writeIndex++] = nextNode
      }
    }
    const adjacency = world.navigationConnectorAdjacency
    const edgeEnd = adjacency.nodeOffsets[node + 1]!
    for (let edgeIndex = adjacency.nodeOffsets[node]!; edgeIndex < edgeEnd; edgeIndex += 1) {
      const toNode = adjacency.toNodes[edgeIndex]!
      if (toNode < 0 || distances[toNode] !== FLOW_UNREACHABLE) continue
      distances[toNode] = distance + 1
      queue[writeIndex++] = toNode
    }
  }
  return writeIndex
}

export function createZombieEscapeReachableSpawn(): ZombieEscapeReachableSpawn {
  return { cell: -1, reachable: false, x: 0, z: 0 }
}

export function resolveZombieEscapeNavigationTargetElevation(
  world: ZombieEscapeCollisionWorld,
  targetY: number,
  previousTargetY: number,
) {
  const nearestLayer = world.navigationLayers[resolveNavigationLayerIndex(world, targetY)]
  if (
    nearestLayer &&
    Math.abs(targetY - nearestLayer.elevation) <=
      NAVIGATION_CONNECTOR_TARGET_LANDING_TOLERANCE_METERS
  ) {
    return nearestLayer.elevation
  }
  return world.navigationLayers.some(({ elevation }) =>
    navigationElevationsMatch(elevation, previousTargetY),
  )
    ? previousTargetY
    : (nearestLayer?.elevation ?? 0)
}

export function resolveZombieEscapeReachableSpawn(
  field: ZombieEscapeFlowField,
  desiredX: number,
  desiredZ: number,
  targetX: number,
  targetZ: number,
  minimumTargetDistanceMeters: number,
  output: ZombieEscapeReachableSpawn,
  targetY = 0,
  desiredY = 0,
) {
  updateZombieEscapeFlowTarget(field, targetX, targetZ, targetY)
  ensureZombieEscapeStrictFlowTarget(field)
  const world = field.world
  const minimumTargetDistance = Math.max(0, finiteNonNegative(minimumTargetDistanceMeters, 0))
  const minimumTargetDistanceSquared = minimumTargetDistance * minimumTargetDistance
  let bestCell = -1
  let bestDistanceSquared = Number.POSITIVE_INFINITY

  const desiredLayerIndex = resolveSupportedNavigationLayerIndex(
    world,
    desiredX,
    desiredZ,
    desiredY,
  )
  for (let reachableIndex = 0; reachableIndex < field.reachableCount; reachableIndex += 1) {
    const node = field.queue[reachableIndex]!
    if (navigationNodeLayerIndex(world, node) !== desiredLayerIndex) continue
    const cell = navigationNodeCell(world, node)
    const column = cell % world.gridWidth
    const row = Math.floor(cell / world.gridWidth)
    const z = world.gridOriginZ + (row + 0.5) * world.cellSize
    const x = world.gridOriginX + (column + 0.5) * world.cellSize
    const targetOffsetX = x - targetX
    const targetOffsetZ = z - targetZ
    if (
      targetOffsetX * targetOffsetX + targetOffsetZ * targetOffsetZ + INTERSECTION_EPSILON <
      minimumTargetDistanceSquared
    ) {
      continue
    }
    const desiredOffsetX = x - desiredX
    const desiredOffsetZ = z - desiredZ
    const distanceSquared = desiredOffsetX * desiredOffsetX + desiredOffsetZ * desiredOffsetZ
    if (
      distanceSquared > bestDistanceSquared + INTERSECTION_EPSILON ||
      (Math.abs(distanceSquared - bestDistanceSquared) <= INTERSECTION_EPSILON &&
        bestCell >= 0 &&
        cell >= bestCell)
    ) {
      continue
    }
    bestCell = cell
    bestDistanceSquared = distanceSquared
  }

  if (bestCell < 0) {
    output.cell = -1
    output.reachable = false
    output.x = 0
    output.z = 0
    return false
  }
  const bestColumn = bestCell % world.gridWidth
  const bestRow = Math.floor(bestCell / world.gridWidth)
  output.cell = bestCell
  output.reachable = true
  output.x = world.gridOriginX + (bestColumn + 0.5) * world.cellSize
  output.z = world.gridOriginZ + (bestRow + 0.5) * world.cellSize
  return true
}

export function resolveZombieEscapeFlowDirection(
  field: ZombieEscapeFlowField,
  x: number,
  z: number,
  targetX: number,
  targetZ: number,
  output: ZombieEscapeFlowSample,
  collisionHit?: ZombieEscapeCollisionHit,
  sourceY = 0,
) {
  const world = field.world
  if (collisionHit) resetCollisionHit(collisionHit)
  resetZombieEscapeFlowBlockingSample(output, x, z)
  const sourceLayerIndex = resolveSupportedNavigationLayerIndex(world, x, z, sourceY)
  const directX = targetX - x
  const directZ = targetZ - z
  const directLength = Math.hypot(directX, directZ)
  if (sourceLayerIndex === field.targetLayerIndex && directLength <= INTERSECTION_EPSILON) {
    output.x = 0
    output.z = 0
    output.reachable = true
    return output
  }
  if (
    sourceLayerIndex === field.targetLayerIndex &&
    directLength > INTERSECTION_EPSILON &&
    zombieEscapeNavigationSegmentIsClear(
      world,
      sourceLayerIndex,
      x,
      z,
      targetX,
      targetZ,
      world.agentRadius,
      collisionHit,
    )
  ) {
    setZombieEscapeFlowBlockingSample(output, collisionHit, x, z, directX, directZ)
    output.x = directX / directLength
    output.z = directZ / directLength
    output.reachable = true
    return output
  }
  setZombieEscapeFlowBlockingSample(output, collisionHit, x, z, directX, directZ)
  ensureZombieEscapeStrictFlowTarget(field)

  const column = worldColumn(world, x)
  const row = worldRow(world, z)
  let bestNode = resolveZombieEscapeFlowWaypointNode(
    field,
    field.distances,
    sourceLayerIndex,
    column,
    row,
    false,
  )
  let usesFallback = false
  if (bestNode < 0) {
    ensureZombieEscapeFallbackFlowTarget(field)
    bestNode = resolveZombieEscapeFlowWaypointNode(
      field,
      field.fallbackDistances,
      sourceLayerIndex,
      column,
      row,
      true,
    )
    usesFallback = bestNode >= 0
  }

  if (bestNode < 0) {
    output.x = 0
    output.z = 0
    output.reachable = false
    return output
  }
  const waypoint = resolveNavigationNodePlanPosition(world, bestNode)
  const waypointX = waypoint.x
  const waypointZ = waypoint.z
  const waypointDirectionX = waypointX - x
  const waypointDirectionZ = waypointZ - z
  const waypointDistance = Math.hypot(waypointDirectionX, waypointDirectionZ)
  if (usesFallback && collisionHit && waypointDistance > INTERSECTION_EPSILON) {
    zombieEscapeNavigationSegmentIsClear(
      world,
      sourceLayerIndex,
      x,
      z,
      waypointX,
      waypointZ,
      world.agentRadius,
      collisionHit,
    )
    setZombieEscapeFlowBlockingSample(
      output,
      collisionHit,
      x,
      z,
      waypointDirectionX,
      waypointDirectionZ,
    )
  }
  output.x = waypointDistance > INTERSECTION_EPSILON ? waypointDirectionX / waypointDistance : 0
  output.z = waypointDistance > INTERSECTION_EPSILON ? waypointDirectionZ / waypointDistance : 0
  output.reachable = true
  return output
}

function resolveZombieEscapeFlowWaypointNode(
  field: ZombieEscapeFlowField,
  distances: Uint32Array,
  sourceLayerIndex: number,
  column: number,
  row: number,
  breakablesTraversable: boolean,
) {
  const world = field.world
  let bestNode = -1
  let bestDistance = FLOW_UNREACHABLE
  for (let neighbor = 0; neighbor < FLOW_NEIGHBOR_X.length; neighbor += 1) {
    const columnOffset = FLOW_NEIGHBOR_X[neighbor]!
    const rowOffset = FLOW_NEIGHBOR_Z[neighbor]!
    const nextColumn = column + columnOffset
    const nextRow = row + rowOffset
    if (!isGridCellWalkable(world, sourceLayerIndex, nextColumn, nextRow, breakablesTraversable)) {
      continue
    }
    if (
      columnOffset !== 0 &&
      rowOffset !== 0 &&
      (!isGridCellWalkable(
        world,
        sourceLayerIndex,
        column + columnOffset,
        row,
        breakablesTraversable,
      ) ||
        !isGridCellWalkable(
          world,
          sourceLayerIndex,
          column,
          row + rowOffset,
          breakablesTraversable,
        ))
    ) {
      continue
    }
    const nextCell = nextRow * world.gridWidth + nextColumn
    const nextNode = navigationNode(world, sourceLayerIndex, nextCell)
    const distance = distances[nextNode]!
    if (distance >= bestDistance) continue
    bestDistance = distance
    bestNode = nextNode
  }
  const currentCell = row * world.gridWidth + column
  const currentNode = navigationNode(world, sourceLayerIndex, currentCell)
  const adjacency = world.navigationConnectorAdjacency
  const edgeEnd = adjacency.nodeOffsets[currentNode + 1]!
  for (let edgeIndex = adjacency.nodeOffsets[currentNode]!; edgeIndex < edgeEnd; edgeIndex += 1) {
    const toNode = adjacency.toNodes[edgeIndex]!
    const distance = toNode >= 0 ? distances[toNode]! : FLOW_UNREACHABLE
    if (distance >= bestDistance) continue
    bestDistance = distance
    bestNode = toNode
  }
  return bestDistance === FLOW_UNREACHABLE ? -1 : bestNode
}

function resetZombieEscapeFlowBlockingSample(
  output: ZombieEscapeFlowSample,
  sourceX: number,
  sourceZ: number,
) {
  output.blockingDistance = Number.POSITIVE_INFINITY
  output.blockingX = sourceX
  output.blockingZ = sourceZ
}

function setZombieEscapeFlowBlockingSample(
  output: ZombieEscapeFlowSample,
  collisionHit: ZombieEscapeCollisionHit | undefined,
  sourceX: number,
  sourceZ: number,
  segmentX: number,
  segmentZ: number,
) {
  if (
    !collisionHit ||
    collisionHit.colliderKind === 'none' ||
    !Number.isFinite(collisionHit.time)
  ) {
    return
  }
  const time = Math.max(0, Math.min(1, collisionHit.time))
  output.blockingDistance = Math.hypot(segmentX, segmentZ) * time
  output.blockingX = sourceX + segmentX * time
  output.blockingZ = sourceZ + segmentZ * time
}

export function zombieEscapeSegmentIsClear(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  radius: number,
  output = createZombieEscapeCollisionHit(),
) {
  sweepZombieEscapeCircleAgainstWorld(
    world,
    startX,
    startZ,
    endX - startX,
    endZ - startZ,
    radius,
    output,
  )
  return output.colliderKind === 'none' || output.time >= 1 - COLLISION_EPSILON_METERS
}

function zombieEscapeNavigationSegmentIsClear(
  world: ZombieEscapeCollisionWorld,
  navigationLayerIndex: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  radius: number,
  output = createZombieEscapeCollisionHit(),
) {
  if (!navigationSegmentStaysSupported(world, navigationLayerIndex, startX, startZ, endX, endZ)) {
    return false
  }
  sweepZombieEscapeCircleAgainstWorldRange(
    world,
    startX,
    startZ,
    endX - startX,
    endZ - startZ,
    radius,
    Number.NEGATIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    output,
    undefined,
    0,
    undefined,
    undefined,
    navigationLayerIndex,
  )
  return output.colliderKind === 'none' || output.time >= 1 - COLLISION_EPSILON_METERS
}

function navigationSegmentStaysSupported(
  world: ZombieEscapeCollisionWorld,
  navigationLayerIndex: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
) {
  const length = Math.hypot(endX - startX, endZ - startZ)
  const sampleCount = Math.max(1, Math.ceil(length / Math.max(0.05, world.cellSize * 0.5)))
  for (let sample = 0; sample <= sampleCount; sample += 1) {
    const amount = sample / sampleCount
    if (
      !navigationLayerSupportsPoint(
        world,
        navigationLayerIndex,
        startX + (endX - startX) * amount,
        startZ + (endZ - startZ) * amount,
      )
    ) {
      return false
    }
  }
  return true
}

function navigationLayerSupportsPoint(
  world: ZombieEscapeCollisionWorld,
  navigationLayerIndex: number,
  x: number,
  z: number,
) {
  const layer = world.navigationLayers[navigationLayerIndex]
  if (!layer) return false
  return navigationLayerSupportsCell(
    world,
    layer,
    Math.floor((x - world.gridOriginX) / world.cellSize),
    Math.floor((z - world.gridOriginZ) / world.cellSize),
  )
}

export function zombieEscapeSegmentIsClearInVerticalRange(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  radius: number,
  minimumY: number,
  maximumY: number,
  output = createZombieEscapeCollisionHit(),
) {
  sweepZombieEscapeCircleAgainstWorldInVerticalRange(
    world,
    startX,
    startZ,
    endX - startX,
    endZ - startZ,
    radius,
    minimumY,
    maximumY,
    output,
  )
  return output.colliderKind === 'none' || output.time >= 1 - COLLISION_EPSILON_METERS
}

export function createZombieEscapeCollisionHit(): ZombieEscapeCollisionHit {
  return {
    colliderIndex: -1,
    colliderKind: 'none',
    normalX: 0,
    normalY: 0,
    normalZ: 0,
    time: Number.POSITIVE_INFINITY,
  }
}

export function createZombieEscapeCircleMoveResult(): ZombieEscapeCircleMoveResult {
  return { collided: false, x: 0, z: 0 }
}

export function createZombieEscapeNavigationMoveResult(): ZombieEscapeNavigationMoveResult {
  return { collided: false, connectorIndex: -1, connectorTargetEnd: false, x: 0, y: 0, z: 0 }
}

export function moveZombieEscapeCircleWithSlide(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startZ: number,
  displacementX: number,
  displacementZ: number,
  radius: number,
  hit: ZombieEscapeCollisionHit,
  output: ZombieEscapeCircleMoveResult,
  ignoredObjectIds?: ReadonlySet<string>,
) {
  return moveZombieEscapeCircleWithSlideOnLayer(
    world,
    startX,
    startZ,
    displacementX,
    displacementZ,
    radius,
    hit,
    output,
    ignoredObjectIds,
  )
}

function moveZombieEscapeCircleWithSlideOnLayer(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startZ: number,
  displacementX: number,
  displacementZ: number,
  radius: number,
  hit: ZombieEscapeCollisionHit,
  output: ZombieEscapeCircleMoveResult,
  ignoredObjectIds?: ReadonlySet<string>,
  navigationLayerIndex?: number,
  enforceSupport = true,
) {
  let x = startX
  let z = startZ
  let remainingX = displacementX
  let remainingZ = displacementZ
  output.collided = false

  if (world.boundaryPolicy === 'solid') {
    const maximumCenterRadius = Math.max(0, world.playRadius - Math.max(0, radius))
    const startRadius = Math.hypot(x, z)
    if (startRadius > maximumCenterRadius) {
      const scale = maximumCenterRadius / Math.max(INTERSECTION_EPSILON, startRadius)
      x *= scale
      z *= scale
      output.collided = true
    }
  }

  for (let iteration = 0; iteration < COLLISION_SWEEP_ITERATIONS; iteration += 1) {
    if (remainingX * remainingX + remainingZ * remainingZ <= INTERSECTION_EPSILON) break
    sweepZombieEscapeCircleAgainstWorldRange(
      world,
      x,
      z,
      remainingX,
      remainingZ,
      radius,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      hit,
      undefined,
      0,
      undefined,
      ignoredObjectIds,
      navigationLayerIndex,
    )
    if (hit.colliderKind === 'none' || hit.time >= 1) {
      x += remainingX
      z += remainingZ
      remainingX = 0
      remainingZ = 0
      break
    }

    output.collided = true
    const amount = Math.max(0, hit.time - COLLISION_EPSILON_METERS)
    x += remainingX * amount + hit.normalX * COLLISION_EPSILON_METERS
    z += remainingZ * amount + hit.normalZ * COLLISION_EPSILON_METERS
    const remainder = Math.max(0, 1 - amount)
    remainingX *= remainder
    remainingZ *= remainder
    const intoSurface = remainingX * hit.normalX + remainingZ * hit.normalZ
    if (intoSurface < 0) {
      remainingX -= hit.normalX * intoSurface
      remainingZ -= hit.normalZ * intoSurface
    }
  }
  if (
    enforceSupport &&
    navigationLayerIndex !== undefined &&
    !navigationSegmentStaysSupported(world, navigationLayerIndex, startX, startZ, x, z)
  ) {
    const sourceLayer = world.navigationLayers[navigationLayerIndex]
    const destinationLayerIndex = resolveSupportedNavigationLayerIndex(
      world,
      x,
      z,
      sourceLayer?.elevation ?? 0,
    )
    const destinationLayer = world.navigationLayers[destinationLayerIndex]
    if (
      !sourceLayer ||
      !destinationLayer ||
      destinationLayer.elevation >=
        sourceLayer.elevation - NAVIGATION_SUPPORT_ELEVATION_TOLERANCE_METERS
    ) {
      let supportedAmount = 0
      let unsupportedAmount = 1
      for (let iteration = 0; iteration < 12; iteration += 1) {
        const amount = (supportedAmount + unsupportedAmount) / 2
        const candidateX = startX + (x - startX) * amount
        const candidateZ = startZ + (z - startZ) * amount
        if (navigationLayerSupportsPoint(world, navigationLayerIndex, candidateX, candidateZ)) {
          supportedAmount = amount
        } else {
          unsupportedAmount = amount
        }
      }
      x = startX + (x - startX) * supportedAmount
      z = startZ + (z - startZ) * supportedAmount
      output.collided = true
    }
  }
  output.x = x
  output.z = z
  return output
}

export function moveZombieEscapeNavigationAgent(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startY: number,
  startZ: number,
  displacementX: number,
  displacementZ: number,
  radius: number,
  connectorIndex: number,
  connectorTargetEnd: boolean,
  hit: ZombieEscapeCollisionHit,
  output: ZombieEscapeNavigationMoveResult,
) {
  const traversal = resolveActiveNavigationConnectorTraversal(
    world,
    connectorIndex,
    connectorTargetEnd,
    startX,
    startY,
    startZ,
    displacementX,
    displacementZ,
    radius,
  )
  let activeConnectorIndex = traversal.connectorIndex
  const targetEnd = traversal.targetEnd
  const connector = world.navigationConnectors[activeConnectorIndex]
  if (!connector) {
    moveZombieEscapeCircleWithSlideOnLayer(
      world,
      startX,
      startZ,
      displacementX,
      displacementZ,
      radius,
      hit,
      output,
      undefined,
      resolveSupportedNavigationLayerIndex(world, startX, startZ, startY),
    )
    output.connectorIndex = -1
    output.connectorTargetEnd = false
    output.y =
      world.navigationLayers[
        resolveSupportedNavigationLayerIndex(world, output.x, output.z, startY)
      ]?.elevation ?? startY
    return output
  }

  const directionAmount = targetEnd ? 1 : -1
  const requestedAlongRun =
    (displacementX * connector.directionX + displacementZ * connector.directionZ) * directionAmount
  const travel = Math.max(0, requestedAlongRun)
  moveZombieEscapeCircleWithSlideOnLayer(
    world,
    startX,
    startZ,
    connector.directionX * directionAmount * travel,
    connector.directionZ * directionAmount * travel,
    radius,
    hit,
    output,
    undefined,
    resolveNavigationLayerIndex(world, startY),
    false,
  )
  const projection = navigationConnectorProjection(connector, output.x, output.z)
  const amount = Math.max(0, Math.min(1, projection / connector.length))
  output.y = connector.startY + (connector.endY - connector.startY) * amount
  const exitDistance = Math.max(0, radius) + COLLISION_EPSILON_METERS
  if (
    (targetEnd && projection >= connector.length + exitDistance) ||
    (!targetEnd && projection <= -exitDistance)
  ) {
    output.y = targetEnd ? connector.endY : connector.startY
    const ascending = targetEnd === connector.ascendingEnd
    activeConnectorIndex = resolveNavigationConnectorChainNeighbor(
      world,
      activeConnectorIndex,
      ascending,
    )
    const nextConnector = world.navigationConnectors[activeConnectorIndex]
    if (nextConnector) {
      const nextTargetEnd = ascending ? nextConnector.ascendingEnd : !nextConnector.ascendingEnd
      const nextSourceEnd = !nextTargetEnd
      output.x = nextSourceEnd ? nextConnector.endX : nextConnector.startX
      output.y = nextSourceEnd ? nextConnector.endY : nextConnector.startY
      output.z = nextSourceEnd ? nextConnector.endZ : nextConnector.startZ
    }
  }
  output.connectorIndex = activeConnectorIndex
  const nextConnector = world.navigationConnectors[activeConnectorIndex]
  output.connectorTargetEnd = nextConnector
    ? targetEnd === connector.ascendingEnd
      ? nextConnector.ascendingEnd
      : !nextConnector.ascendingEnd
    : false
  return output
}

function resolveNavigationConnectorChainNeighbor(
  world: ZombieEscapeCollisionWorld,
  connectorIndex: number,
  ascending: boolean,
) {
  const connector = world.navigationConnectors[connectorIndex]
  if (!connector) return -1
  const targetOrder = connector.chainOrder + (ascending ? 1 : -1)
  return world.navigationConnectors.findIndex(
    (candidate) => candidate.chainId === connector.chainId && candidate.chainOrder === targetOrder,
  )
}

function resolveActiveNavigationConnectorTraversal(
  world: ZombieEscapeCollisionWorld,
  connectorIndex: number,
  connectorTargetEnd: boolean,
  x: number,
  y: number,
  z: number,
  displacementX: number,
  displacementZ: number,
  radius: number,
) {
  const active = world.navigationConnectors[connectorIndex]
  if (active) {
    const projection = navigationConnectorProjection(active, x, z)
    const lateralDistance = Math.abs(navigationConnectorLateralDistance(active, x, z))
    const amount = Math.max(0, Math.min(1, projection / active.length))
    const surfaceY = active.startY + (active.endY - active.startY) * amount
    if (
      projection >= -radius - world.cellSize &&
      projection <= active.length + radius + world.cellSize &&
      lateralDistance <= active.halfWidth + COLLISION_EPSILON_METERS &&
      Math.abs(y - surfaceY) <= NAVIGATION_CONNECTOR_ENTRY_HEIGHT_TOLERANCE_METERS
    ) {
      return { connectorIndex, targetEnd: connectorTargetEnd }
    }
  }

  const displacementLength = Math.hypot(displacementX, displacementZ)
  if (displacementLength <= INTERSECTION_EPSILON) {
    return { connectorIndex: -1, targetEnd: false }
  }
  let bestConnector = -1
  let bestTargetEnd = false
  let bestDistanceSquared = Number.POSITIVE_INFINITY
  for (let index = 0; index < world.navigationConnectors.length; index += 1) {
    const connector = world.navigationConnectors[index]!
    for (const targetEnd of [false, true]) {
      const sourceX = targetEnd ? connector.startX : connector.endX
      const sourceY = targetEnd ? connector.startY : connector.endY
      const sourceZ = targetEnd ? connector.startZ : connector.endZ
      if (Math.abs(y - sourceY) > NAVIGATION_CONNECTOR_ENTRY_HEIGHT_TOLERANCE_METERS) continue
      const directionAmount = targetEnd ? 1 : -1
      const towardRunX = connector.directionX * directionAmount
      const towardRunZ = connector.directionZ * directionAmount
      if (displacementX * towardRunX + displacementZ * towardRunZ <= 0) continue
      const offsetX = x - sourceX
      const offsetZ = z - sourceZ
      const along = offsetX * towardRunX + offsetZ * towardRunZ
      const lateral = Math.abs(offsetX * -towardRunZ + offsetZ * towardRunX)
      const activationDistance = Math.max(0, radius) + world.cellSize * 1.5
      if (
        along < -activationDistance ||
        along > activationDistance ||
        lateral > Math.max(0, connector.halfWidth - Math.max(0, radius))
      ) {
        continue
      }
      const distanceSquared = offsetX * offsetX + offsetZ * offsetZ
      if (distanceSquared >= bestDistanceSquared) continue
      bestDistanceSquared = distanceSquared
      bestConnector = index
      bestTargetEnd = targetEnd
    }
  }
  return { connectorIndex: bestConnector, targetEnd: bestTargetEnd }
}

function navigationConnectorProjection(
  connector: ZombieEscapeNavigationConnector,
  x: number,
  z: number,
) {
  return (
    (x - connector.startX) * connector.directionX + (z - connector.startZ) * connector.directionZ
  )
}

function navigationConnectorLateralDistance(
  connector: ZombieEscapeNavigationConnector,
  x: number,
  z: number,
) {
  return (
    (x - connector.startX) * -connector.directionZ + (z - connector.startZ) * connector.directionX
  )
}

export function sweepZombieEscapeCircleAgainstWorld(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startZ: number,
  displacementX: number,
  displacementZ: number,
  radius: number,
  output: ZombieEscapeCollisionHit,
  ignoredObjectIds?: ReadonlySet<string>,
) {
  return sweepZombieEscapeCircleAgainstWorldRange(
    world,
    startX,
    startZ,
    displacementX,
    displacementZ,
    radius,
    Number.NEGATIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    output,
    undefined,
    0,
    undefined,
    ignoredObjectIds,
  )
}

export function sweepZombieEscapeCircleAgainstWorldInVerticalRange(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startZ: number,
  displacementX: number,
  displacementZ: number,
  radius: number,
  minimumY: number,
  maximumY: number,
  output: ZombieEscapeCollisionHit,
) {
  const resolvedMinimumY = Math.min(minimumY, maximumY)
  const resolvedMaximumY = Math.max(minimumY, maximumY)
  return sweepZombieEscapeCircleAgainstWorldRange(
    world,
    startX,
    startZ,
    displacementX,
    displacementZ,
    radius,
    resolvedMinimumY,
    resolvedMaximumY,
    output,
  )
}

export function sweepZombieEscapeProjectileAgainstWorld(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startY: number,
  startZ: number,
  displacementX: number,
  displacementY: number,
  displacementZ: number,
  radius: number,
  output: ZombieEscapeCollisionHit,
  candidate: ZombieEscapeCollisionHit,
) {
  const endY = startY + displacementY
  const sweepRadius = Math.max(0, radius)
  return sweepZombieEscapeCircleAgainstWorldRange(
    world,
    startX,
    startZ,
    displacementX,
    displacementZ,
    sweepRadius,
    Math.min(startY, endY) - sweepRadius,
    Math.max(startY, endY) + sweepRadius,
    output,
    startY,
    displacementY,
    candidate,
  )
}

function sweepZombieEscapeCircleAgainstWorldRange(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startZ: number,
  displacementX: number,
  displacementZ: number,
  radius: number,
  minimumY: number,
  maximumY: number,
  output: ZombieEscapeCollisionHit,
  trajectoryStartY?: number,
  trajectoryDisplacementY = 0,
  trajectoryCandidate?: ZombieEscapeCollisionHit,
  ignoredObjectIds?: ReadonlySet<string>,
  navigationLayerIndex?: number,
) {
  resetCollisionHit(output)
  const endX = startX + displacementX
  const endZ = startZ + displacementZ
  const sweepRadius = Math.max(0, radius)

  if (world.boundaryPolicy === 'solid') {
    const boundaryRadius = Math.max(0, world.playRadius - sweepRadius)
    const boundaryAmount = segmentCircleExitIntersectionAmount(
      startX,
      startZ,
      endX,
      endZ,
      boundaryRadius,
    )
    if (boundaryAmount < output.time) {
      const hitX = startX + displacementX * boundaryAmount
      const hitZ = startZ + displacementZ * boundaryAmount
      const inverseLength = 1 / Math.max(INTERSECTION_EPSILON, Math.hypot(hitX, hitZ))
      output.colliderIndex = -1
      output.colliderKind = 'boundary'
      output.normalX = -hitX * inverseLength
      output.normalY = 0
      output.normalZ = -hitZ * inverseLength
      output.time = boundaryAmount
    }
  }

  const broadphase = world.broadphase
  const minimumX = Math.min(startX, endX) - sweepRadius
  const maximumX = Math.max(startX, endX) + sweepRadius
  const minimumZ = Math.min(startZ, endZ) - sweepRadius
  const maximumZ = Math.max(startZ, endZ) + sweepRadius
  const broadphaseMaximumX = broadphase.gridOriginX + broadphase.gridWidth * broadphase.cellSize
  const broadphaseMaximumZ = broadphase.gridOriginZ + broadphase.gridHeight * broadphase.cellSize
  if (
    maximumX < broadphase.gridOriginX ||
    maximumZ < broadphase.gridOriginZ ||
    minimumX > broadphaseMaximumX ||
    minimumZ > broadphaseMaximumZ
  ) {
    return output
  }
  const minimumColumn = clampGridIndex(
    Math.floor((minimumX - broadphase.gridOriginX) / broadphase.cellSize),
    broadphase.gridWidth,
  )
  const maximumColumn = clampGridIndex(
    Math.floor((maximumX - broadphase.gridOriginX) / broadphase.cellSize),
    broadphase.gridWidth,
  )
  const minimumRow = clampGridIndex(
    Math.floor((minimumZ - broadphase.gridOriginZ) / broadphase.cellSize),
    broadphase.gridHeight,
  )
  const maximumRow = clampGridIndex(
    Math.floor((maximumZ - broadphase.gridOriginZ) / broadphase.cellSize),
    broadphase.gridHeight,
  )

  const epoch = beginBroadphaseVisit(broadphase)
  const segmentCount = world.segments.length
  const circleCount = world.circles.length
  for (let row = minimumRow; row <= maximumRow; row += 1) {
    for (let column = minimumColumn; column <= maximumColumn; column += 1) {
      const cell: number = row * broadphase.gridWidth + column
      const startOffset: number = broadphase.cellOffsets[cell]!
      const endOffset: number = broadphase.cellOffsets[cell + 1]!
      for (let offset: number = startOffset; offset < endOffset; offset += 1) {
        const colliderIndex = broadphase.colliderIndices[offset]!
        if (broadphase.visitStamps[colliderIndex] === epoch) continue
        broadphase.visitStamps[colliderIndex] = epoch
        if (colliderIndex < segmentCount) {
          const segment = world.segments[colliderIndex]!
          if (ignoredObjectIds?.has(segment.objectId)) continue
          if (!colliderMatchesNavigationLayer(world, segment, navigationLayerIndex)) continue
          if (!verticalRangesOverlap(segment, minimumY, maximumY)) continue
          if (trajectoryStartY === undefined || trajectoryCandidate === undefined) {
            updateSegmentHit(
              startX,
              startZ,
              endX,
              endZ,
              segment,
              segment.halfThickness + sweepRadius,
              colliderIndex,
              output,
            )
          } else {
            updateTrajectorySegmentHit(
              startX,
              trajectoryStartY,
              startZ,
              endX,
              endZ,
              trajectoryDisplacementY,
              segment,
              segment.halfThickness + sweepRadius,
              sweepRadius,
              colliderIndex,
              output,
              trajectoryCandidate,
            )
          }
          continue
        }

        if (colliderIndex < segmentCount + circleCount) {
          const circleIndex = colliderIndex - segmentCount
          const circle = world.circles[circleIndex]!
          if (ignoredObjectIds?.has(circle.objectId)) continue
          if (!colliderMatchesNavigationLayer(world, circle, navigationLayerIndex)) continue
          if (!verticalRangesOverlap(circle, minimumY, maximumY)) continue
          if (trajectoryStartY === undefined || trajectoryCandidate === undefined) {
            updateCircleHit(
              startX,
              startZ,
              endX,
              endZ,
              circle,
              circle.radius + sweepRadius,
              circleIndex,
              output,
            )
          } else {
            updateTrajectoryCircleHit(
              startX,
              trajectoryStartY,
              startZ,
              endX,
              endZ,
              trajectoryDisplacementY,
              circle,
              circle.radius + sweepRadius,
              sweepRadius,
              circleIndex,
              output,
              trajectoryCandidate,
            )
          }
          continue
        }

        const boxIndex = colliderIndex - segmentCount - circleCount
        const box = world.boxes[boxIndex]!
        if (ignoredObjectIds?.has(box.objectId)) continue
        if (!colliderMatchesNavigationLayer(world, box, navigationLayerIndex)) continue
        if (!verticalRangesOverlap(box, minimumY, maximumY)) continue
        if (trajectoryStartY === undefined || trajectoryCandidate === undefined) {
          updateBoxHit(startX, startZ, endX, endZ, box, sweepRadius, boxIndex, output)
        } else {
          updateTrajectoryBoxHit(
            startX,
            trajectoryStartY,
            startZ,
            endX,
            endZ,
            trajectoryDisplacementY,
            box,
            sweepRadius,
            boxIndex,
            output,
            trajectoryCandidate,
          )
        }
      }
    }
  }
  return output
}

function createCollisionBroadphase(
  playRadius: number,
  boundaryPolicy: ZombieEscapeCollisionBoundaryPolicy,
  cellSize: number,
  boxes: readonly ZombieEscapeCollisionBox[],
  circles: readonly ZombieEscapeCollisionCircle[],
  segments: readonly ZombieEscapeCollisionSegment[],
): ZombieEscapeCollisionBroadphase {
  const colliderBounds = resolveCollisionAabb(boxes, circles, segments)
  const useColliderBounds = boundaryPolicy === 'none' && colliderBounds !== null
  const gridOriginX = useColliderBounds
    ? Math.floor(colliderBounds.minimumX / cellSize) * cellSize
    : boundaryPolicy === 'none'
      ? -cellSize / 2
      : -Math.ceil((playRadius * 2) / cellSize) * cellSize * 0.5
  const gridOriginZ = useColliderBounds
    ? Math.floor(colliderBounds.minimumZ / cellSize) * cellSize
    : boundaryPolicy === 'none'
      ? -cellSize / 2
      : -Math.ceil((playRadius * 2) / cellSize) * cellSize * 0.5
  const gridWidth = useColliderBounds
    ? Math.max(1, Math.ceil((colliderBounds.maximumX - gridOriginX) / cellSize))
    : boundaryPolicy === 'none'
      ? 1
      : Math.max(1, Math.ceil((playRadius * 2) / cellSize))
  const gridHeight = useColliderBounds
    ? Math.max(1, Math.ceil((colliderBounds.maximumZ - gridOriginZ) / cellSize))
    : boundaryPolicy === 'none'
      ? 1
      : gridWidth
  const cellCounts = new Uint32Array(gridWidth * gridHeight)

  for (const segment of segments) {
    addColliderToCellCounts(
      cellCounts,
      gridWidth,
      gridHeight,
      gridOriginX,
      gridOriginZ,
      cellSize,
      Math.min(segment.startX, segment.endX) - segment.halfThickness,
      Math.min(segment.startZ, segment.endZ) - segment.halfThickness,
      Math.max(segment.startX, segment.endX) + segment.halfThickness,
      Math.max(segment.startZ, segment.endZ) + segment.halfThickness,
    )
  }
  for (const circle of circles) {
    addColliderToCellCounts(
      cellCounts,
      gridWidth,
      gridHeight,
      gridOriginX,
      gridOriginZ,
      cellSize,
      circle.x - circle.radius,
      circle.z - circle.radius,
      circle.x + circle.radius,
      circle.z + circle.radius,
    )
  }
  for (const box of boxes) {
    const bounds = resolveBoxAabb(box)
    addColliderToCellCounts(
      cellCounts,
      gridWidth,
      gridHeight,
      gridOriginX,
      gridOriginZ,
      cellSize,
      bounds.minimumX,
      bounds.minimumZ,
      bounds.maximumX,
      bounds.maximumZ,
    )
  }

  const cellOffsets = new Uint32Array(cellCounts.length + 1)
  for (let cell = 0; cell < cellCounts.length; cell += 1) {
    cellOffsets[cell + 1] = cellOffsets[cell]! + cellCounts[cell]!
  }
  const colliderIndices = new Uint32Array(cellOffsets[cellOffsets.length - 1] ?? 0)
  const writeOffsets = cellOffsets.slice(0, -1)
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!
    writeColliderToCells(
      colliderIndices,
      writeOffsets,
      gridWidth,
      gridHeight,
      gridOriginX,
      gridOriginZ,
      cellSize,
      Math.min(segment.startX, segment.endX) - segment.halfThickness,
      Math.min(segment.startZ, segment.endZ) - segment.halfThickness,
      Math.max(segment.startX, segment.endX) + segment.halfThickness,
      Math.max(segment.startZ, segment.endZ) + segment.halfThickness,
      index,
    )
  }
  for (let index = 0; index < circles.length; index += 1) {
    const circle = circles[index]!
    writeColliderToCells(
      colliderIndices,
      writeOffsets,
      gridWidth,
      gridHeight,
      gridOriginX,
      gridOriginZ,
      cellSize,
      circle.x - circle.radius,
      circle.z - circle.radius,
      circle.x + circle.radius,
      circle.z + circle.radius,
      segments.length + index,
    )
  }
  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index]!
    const bounds = resolveBoxAabb(box)
    writeColliderToCells(
      colliderIndices,
      writeOffsets,
      gridWidth,
      gridHeight,
      gridOriginX,
      gridOriginZ,
      cellSize,
      bounds.minimumX,
      bounds.minimumZ,
      bounds.maximumX,
      bounds.maximumZ,
      segments.length + circles.length + index,
    )
  }

  return {
    cellOffsets,
    cellSize,
    colliderIndices,
    gridHeight,
    gridOriginX,
    gridOriginZ,
    gridWidth,
    visitEpoch: new Uint32Array(1),
    visitStamps: new Uint32Array(segments.length + circles.length + boxes.length),
  }
}

function resolveCollisionAabb(
  boxes: readonly ZombieEscapeCollisionBox[],
  circles: readonly ZombieEscapeCollisionCircle[],
  segments: readonly ZombieEscapeCollisionSegment[],
): CollisionAabbBounds | null {
  let maximumX = Number.NEGATIVE_INFINITY
  let maximumZ = Number.NEGATIVE_INFINITY
  let minimumX = Number.POSITIVE_INFINITY
  let minimumZ = Number.POSITIVE_INFINITY
  const include = (bounds: CollisionAabbBounds) => {
    maximumX = Math.max(maximumX, bounds.maximumX)
    maximumZ = Math.max(maximumZ, bounds.maximumZ)
    minimumX = Math.min(minimumX, bounds.minimumX)
    minimumZ = Math.min(minimumZ, bounds.minimumZ)
  }
  for (const segment of segments) {
    include({
      maximumX: Math.max(segment.startX, segment.endX) + segment.halfThickness,
      maximumZ: Math.max(segment.startZ, segment.endZ) + segment.halfThickness,
      minimumX: Math.min(segment.startX, segment.endX) - segment.halfThickness,
      minimumZ: Math.min(segment.startZ, segment.endZ) - segment.halfThickness,
    })
  }
  for (const circle of circles) {
    include({
      maximumX: circle.x + circle.radius,
      maximumZ: circle.z + circle.radius,
      minimumX: circle.x - circle.radius,
      minimumZ: circle.z - circle.radius,
    })
  }
  for (const box of boxes) include(resolveBoxAabb(box))
  return Number.isFinite(minimumX) ? { maximumX, maximumZ, minimumX, minimumZ } : null
}

function addColliderToCellCounts(
  counts: Uint32Array,
  gridWidth: number,
  gridHeight: number,
  originX: number,
  originZ: number,
  cellSize: number,
  minimumX: number,
  minimumZ: number,
  maximumX: number,
  maximumZ: number,
) {
  const bounds = resolveGridAabbBounds(
    gridWidth,
    gridHeight,
    originX,
    originZ,
    cellSize,
    minimumX,
    minimumZ,
    maximumX,
    maximumZ,
  )
  if (!bounds) return
  for (let row = bounds.minimumRow; row <= bounds.maximumRow; row += 1) {
    for (let column = bounds.minimumColumn; column <= bounds.maximumColumn; column += 1) {
      counts[row * gridWidth + column]! += 1
    }
  }
}

function writeColliderToCells(
  colliderIndices: Uint32Array,
  writeOffsets: Uint32Array,
  gridWidth: number,
  gridHeight: number,
  originX: number,
  originZ: number,
  cellSize: number,
  minimumX: number,
  minimumZ: number,
  maximumX: number,
  maximumZ: number,
  colliderIndex: number,
) {
  const bounds = resolveGridAabbBounds(
    gridWidth,
    gridHeight,
    originX,
    originZ,
    cellSize,
    minimumX,
    minimumZ,
    maximumX,
    maximumZ,
  )
  if (!bounds) return
  for (let row = bounds.minimumRow; row <= bounds.maximumRow; row += 1) {
    for (let column = bounds.minimumColumn; column <= bounds.maximumColumn; column += 1) {
      const cell = row * gridWidth + column
      colliderIndices[writeOffsets[cell]!] = colliderIndex
      writeOffsets[cell]! += 1
    }
  }
}

function resolveGridAabbBounds(
  gridWidth: number,
  gridHeight: number,
  originX: number,
  originZ: number,
  cellSize: number,
  minimumX: number,
  minimumZ: number,
  maximumX: number,
  maximumZ: number,
): GridAabbBounds | null {
  const gridMaximumX = originX + gridWidth * cellSize
  const gridMaximumZ = originZ + gridHeight * cellSize
  if (
    maximumX < originX ||
    maximumZ < originZ ||
    minimumX > gridMaximumX ||
    minimumZ > gridMaximumZ
  ) {
    return null
  }
  return {
    maximumColumn: clampGridIndex(Math.floor((maximumX - originX) / cellSize), gridWidth),
    maximumRow: clampGridIndex(Math.floor((maximumZ - originZ) / cellSize), gridHeight),
    minimumColumn: clampGridIndex(Math.floor((minimumX - originX) / cellSize), gridWidth),
    minimumRow: clampGridIndex(Math.floor((minimumZ - originZ) / cellSize), gridHeight),
  }
}

function beginBroadphaseVisit(broadphase: ZombieEscapeCollisionBroadphase) {
  let epoch = (broadphase.visitEpoch[0]! + 1) >>> 0
  if (epoch === 0) {
    broadphase.visitStamps.fill(0)
    epoch = 1
  }
  broadphase.visitEpoch[0] = epoch
  return epoch
}

function createNavigationLayers(
  playRadius: number,
  agentRadius: number,
  gridWidth: number,
  gridHeight: number,
  originX: number,
  originZ: number,
  cellSize: number,
  boxes: readonly ZombieEscapeCollisionBox[],
  circles: readonly ZombieEscapeCollisionCircle[],
  segments: readonly ZombieEscapeCollisionSegment[],
  supports: readonly ZombieEscapeNavigationSupportSource[],
) {
  const elevations = createNavigationLayerElevations(supports)
  const maximumCenterRadius = Math.max(0, playRadius - agentRadius)
  return elevations.map((elevation) => {
    const support = new Uint8Array(gridWidth * gridHeight)
    const supportSources = supports.filter((candidate) =>
      navigationSupportElevationsMatch(candidate.elevation, elevation),
    )
    const implicitGround = navigationSupportElevationsMatch(elevation, 0)
    for (let row = 0; row < gridHeight; row += 1) {
      const z = originZ + (row + 0.5) * cellSize
      for (let column = 0; column < gridWidth; column += 1) {
        const x = originX + (column + 0.5) * cellSize
        if (
          pointHasNavigationSupport(
            x,
            z,
            agentRadius,
            maximumCenterRadius,
            implicitGround,
            supportSources,
          )
        ) {
          support[row * gridWidth + column] = 1
        }
      }
    }
    const occupancy = new Uint8Array(support.length)
    for (let cell = 0; cell < support.length; cell += 1) {
      occupancy[cell] = support[cell] === 1 ? 0 : 1
    }
    const breakableOpenOccupancy = occupancy.slice()
    for (const circle of circles) {
      if (!colliderVerticalRangeBlocksNavigationElevation(circle, elevation)) continue
      rasterizeCircle(
        occupancy,
        gridWidth,
        gridHeight,
        originX,
        originZ,
        cellSize,
        circle,
        agentRadius,
      )
      if (!circle.breakable) {
        rasterizeCircle(
          breakableOpenOccupancy,
          gridWidth,
          gridHeight,
          originX,
          originZ,
          cellSize,
          circle,
          agentRadius,
        )
      }
    }
    for (const box of boxes) {
      if (!colliderVerticalRangeBlocksNavigationElevation(box, elevation)) continue
      rasterizeBox(occupancy, gridWidth, gridHeight, originX, originZ, cellSize, box, agentRadius)
      if (!box.breakable) {
        rasterizeBox(
          breakableOpenOccupancy,
          gridWidth,
          gridHeight,
          originX,
          originZ,
          cellSize,
          box,
          agentRadius,
        )
      }
    }
    for (const segment of segments) {
      if (!colliderVerticalRangeBlocksNavigationElevation(segment, elevation)) continue
      rasterizeSegment(
        occupancy,
        gridWidth,
        gridHeight,
        originX,
        originZ,
        cellSize,
        segment,
        agentRadius,
      )
      if (!segment.breakable) {
        rasterizeSegment(
          breakableOpenOccupancy,
          gridWidth,
          gridHeight,
          originX,
          originZ,
          cellSize,
          segment,
          agentRadius,
        )
      }
    }
    return { breakableOpenOccupancy, elevation, occupancy, support }
  })
}

function createNavigationLayerElevations(supports: readonly ZombieEscapeNavigationSupportSource[]) {
  const candidates = [0, ...supports.map(({ elevation }) => elevation)].sort(
    (first, second) => first - second,
  )
  const elevations: number[] = []
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate)) continue
    const previous = elevations[elevations.length - 1]
    if (previous !== undefined && navigationSupportElevationsMatch(previous, candidate)) continue
    elevations.push(candidate)
  }
  return elevations.length > 0 ? elevations : [0]
}

function navigationElevationsMatch(first: number, second: number) {
  return Math.abs(first - second) <= COLLISION_EPSILON_METERS
}

function navigationSupportElevationsMatch(first: number, second: number) {
  return Math.abs(first - second) <= NAVIGATION_SUPPORT_ELEVATION_TOLERANCE_METERS
}

function colliderVerticalRangeBlocksNavigationElevation(
  collider: Readonly<{ maximumY: number; minimumY: number }>,
  elevation: number,
) {
  return (
    collider.maximumY > elevation + COLLISION_EPSILON_METERS &&
    collider.minimumY < elevation + NAVIGATION_AGENT_HEIGHT_METERS - COLLISION_EPSILON_METERS
  )
}

function colliderMatchesNavigationLayer(
  world: ZombieEscapeCollisionWorld,
  collider: Readonly<{ maximumY: number; minimumY: number }>,
  navigationLayerIndex: number | undefined,
) {
  if (navigationLayerIndex === undefined) return true
  const layer = world.navigationLayers[navigationLayerIndex]
  return Boolean(layer && colliderVerticalRangeBlocksNavigationElevation(collider, layer.elevation))
}

function pointHasNavigationSupport(
  x: number,
  z: number,
  agentRadius: number,
  maximumCenterRadius: number,
  implicitGround: boolean,
  supports: readonly ZombieEscapeNavigationSupportSource[],
) {
  if (implicitGround) return x * x + z * z <= maximumCenterRadius * maximumCenterRadius
  if (!pointIsOnAnyNavigationSupport(x, z, supports)) return false
  const radius = Math.max(0, agentRadius)
  if (radius <= COLLISION_EPSILON_METERS) return true
  for (let sample = 0; sample < 12; sample += 1) {
    const angle = (sample / 12) * Math.PI * 2
    if (
      !pointIsOnAnyNavigationSupport(
        x + Math.cos(angle) * radius,
        z + Math.sin(angle) * radius,
        supports,
      )
    ) {
      return false
    }
  }
  return true
}

function pointIsOnAnyNavigationSupport(
  x: number,
  z: number,
  supports: readonly ZombieEscapeNavigationSupportSource[],
) {
  return supports.some(
    (support) =>
      pointIsInsideNavigationRing(x, z, support.polygon) &&
      !(support.holes ?? []).some((hole) => pointIsInsideNavigationRing(x, z, hole)),
  )
}

function pointIsInsideNavigationRing(
  x: number,
  z: number,
  ring: readonly Readonly<{ x: number; z: number }>[],
) {
  if (ring.length < 3) return false
  let inside = false
  for (
    let index = 0, previousIndex = ring.length - 1;
    index < ring.length;
    previousIndex = index++
  ) {
    const point = ring[index]!
    const previous = ring[previousIndex]!
    if (pointDistanceToSegmentSquared(x, z, previous.x, previous.z, point.x, point.z) <= 1e-12) {
      return true
    }
    if (
      point.z > z !== previous.z > z &&
      x < ((previous.x - point.x) * (z - point.z)) / (previous.z - point.z) + point.x
    ) {
      inside = !inside
    }
  }
  return inside
}

function pointDistanceToSegmentSquared(
  x: number,
  z: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
) {
  const segmentX = endX - startX
  const segmentZ = endZ - startZ
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ
  const amount =
    lengthSquared <= INTERSECTION_EPSILON
      ? 0
      : Math.max(
          0,
          Math.min(1, ((x - startX) * segmentX + (z - startZ) * segmentZ) / lengthSquared),
        )
  const offsetX = x - (startX + segmentX * amount)
  const offsetZ = z - (startZ + segmentZ * amount)
  return offsetX * offsetX + offsetZ * offsetZ
}

function rasterizeCircle(
  occupancy: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  originX: number,
  originZ: number,
  cellSize: number,
  circle: ZombieEscapeCollisionCircle,
  agentRadius: number,
) {
  const radius = circle.radius + agentRadius
  const minimumColumn = clampGridIndex(
    Math.floor((circle.x - radius - originX) / cellSize),
    gridWidth,
  )
  const maximumColumn = clampGridIndex(
    Math.floor((circle.x + radius - originX) / cellSize),
    gridWidth,
  )
  const minimumRow = clampGridIndex(
    Math.floor((circle.z - radius - originZ) / cellSize),
    gridHeight,
  )
  const maximumRow = clampGridIndex(
    Math.floor((circle.z + radius - originZ) / cellSize),
    gridHeight,
  )
  const radiusSquared = radius * radius
  for (let row = minimumRow; row <= maximumRow; row += 1) {
    const z = originZ + (row + 0.5) * cellSize
    for (let column = minimumColumn; column <= maximumColumn; column += 1) {
      const x = originX + (column + 0.5) * cellSize
      const dx = x - circle.x
      const dz = z - circle.z
      if (dx * dx + dz * dz <= radiusSquared) occupancy[row * gridWidth + column] = 1
    }
  }
}

function rasterizeBox(
  occupancy: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  originX: number,
  originZ: number,
  cellSize: number,
  box: ZombieEscapeCollisionBox,
  agentRadius: number,
) {
  const bounds = resolveBoxAabb(box)
  const minimumColumn = clampGridIndex(
    Math.floor((bounds.minimumX - agentRadius - originX) / cellSize),
    gridWidth,
  )
  const maximumColumn = clampGridIndex(
    Math.floor((bounds.maximumX + agentRadius - originX) / cellSize),
    gridWidth,
  )
  const minimumRow = clampGridIndex(
    Math.floor((bounds.minimumZ - agentRadius - originZ) / cellSize),
    gridHeight,
  )
  const maximumRow = clampGridIndex(
    Math.floor((bounds.maximumZ + agentRadius - originZ) / cellSize),
    gridHeight,
  )
  const radiusSquared = agentRadius * agentRadius
  for (let row = minimumRow; row <= maximumRow; row += 1) {
    const z = originZ + (row + 0.5) * cellSize
    for (let column = minimumColumn; column <= maximumColumn; column += 1) {
      const x = originX + (column + 0.5) * cellSize
      const offsetX = x - box.centerX
      const offsetZ = z - box.centerZ
      const localX = box.cosine * offsetX - box.sine * offsetZ
      const localZ = box.sine * offsetX + box.cosine * offsetZ
      const outsideX = Math.max(Math.abs(localX) - box.halfWidth, 0)
      const outsideZ = Math.max(Math.abs(localZ) - box.halfDepth, 0)
      if (outsideX * outsideX + outsideZ * outsideZ <= radiusSquared) {
        occupancy[row * gridWidth + column] = 1
      }
    }
  }
}

function resolveBoxAabb(box: ZombieEscapeCollisionBox) {
  const extentX = Math.abs(box.cosine) * box.halfWidth + Math.abs(box.sine) * box.halfDepth
  const extentZ = Math.abs(box.sine) * box.halfWidth + Math.abs(box.cosine) * box.halfDepth
  return {
    maximumX: box.centerX + extentX,
    maximumZ: box.centerZ + extentZ,
    minimumX: box.centerX - extentX,
    minimumZ: box.centerZ - extentZ,
  }
}

function rasterizeSegment(
  occupancy: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  originX: number,
  originZ: number,
  cellSize: number,
  segment: ZombieEscapeCollisionSegment,
  agentRadius: number,
) {
  const radius = segment.halfThickness + agentRadius
  const minimumColumn = clampGridIndex(
    Math.floor((Math.min(segment.startX, segment.endX) - radius - originX) / cellSize),
    gridWidth,
  )
  const maximumColumn = clampGridIndex(
    Math.floor((Math.max(segment.startX, segment.endX) + radius - originX) / cellSize),
    gridWidth,
  )
  const minimumRow = clampGridIndex(
    Math.floor((Math.min(segment.startZ, segment.endZ) - radius - originZ) / cellSize),
    gridHeight,
  )
  const maximumRow = clampGridIndex(
    Math.floor((Math.max(segment.startZ, segment.endZ) + radius - originZ) / cellSize),
    gridHeight,
  )
  for (let row = minimumRow; row <= maximumRow; row += 1) {
    const z = originZ + (row + 0.5) * cellSize
    for (let column = minimumColumn; column <= maximumColumn; column += 1) {
      const x = originX + (column + 0.5) * cellSize
      if (pointIsInsideExpandedSegment(x, z, segment, radius)) {
        occupancy[row * gridWidth + column] = 1
      }
    }
  }
}

function pointIsInsideExpandedSegment(
  x: number,
  z: number,
  segment: ZombieEscapeCollisionSegment,
  radius: number,
) {
  const segmentX = segment.endX - segment.startX
  const segmentZ = segment.endZ - segment.startZ
  const segmentLength = Math.hypot(segmentX, segmentZ)
  if (segmentLength <= INTERSECTION_EPSILON) {
    if (segment.startCap === 'flat' && segment.endCap === 'flat') return false
    return Math.hypot(x - segment.startX, z - segment.startZ) <= radius
  }
  const tangentX = segmentX / segmentLength
  const tangentZ = segmentZ / segmentLength
  const offsetX = x - segment.startX
  const offsetZ = z - segment.startZ
  const along = offsetX * tangentX + offsetZ * tangentZ
  const across = -offsetX * tangentZ + offsetZ * tangentX
  if (along >= 0 && along <= segmentLength && Math.abs(across) <= radius) return true
  if (along < 0 && segment.startCap === 'round') {
    return offsetX * offsetX + offsetZ * offsetZ <= radius * radius
  }
  if (along > segmentLength && segment.endCap === 'round') {
    const endOffsetX = x - segment.endX
    const endOffsetZ = z - segment.endZ
    return endOffsetX * endOffsetX + endOffsetZ * endOffsetZ <= radius * radius
  }
  return false
}

function updateTrajectoryBoxHit(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endZ: number,
  displacementY: number,
  box: ZombieEscapeCollisionBox,
  radius: number,
  colliderIndex: number,
  output: ZombieEscapeCollisionHit,
  candidate: ZombieEscapeCollisionHit,
) {
  resetCollisionHit(candidate)
  updateBoxHit(startX, startZ, endX, endZ, box, radius, colliderIndex, candidate)
  if (candidate.colliderKind === 'none') return
  const entry = candidate.time
  const normalX = candidate.normalX
  const normalZ = candidate.normalZ

  resetCollisionHit(candidate)
  updateBoxHit(endX, endZ, startX, startZ, box, radius, colliderIndex, candidate)
  if (!Number.isFinite(candidate.time)) return
  updateTrajectoryHit(
    entry,
    1 - candidate.time,
    normalX,
    normalZ,
    startY,
    displacementY,
    radius,
    box.minimumY,
    box.maximumY,
    'box',
    colliderIndex,
    output,
  )
}

function updateTrajectoryCircleHit(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endZ: number,
  displacementY: number,
  circle: ZombieEscapeCollisionCircle,
  footprintRadius: number,
  projectileRadius: number,
  colliderIndex: number,
  output: ZombieEscapeCollisionHit,
  candidate: ZombieEscapeCollisionHit,
) {
  resetCollisionHit(candidate)
  updateCircleHit(startX, startZ, endX, endZ, circle, footprintRadius, colliderIndex, candidate)
  if (candidate.colliderKind === 'none') return
  const entry = candidate.time
  const normalX = candidate.normalX
  const normalZ = candidate.normalZ

  resetCollisionHit(candidate)
  updateCircleHit(endX, endZ, startX, startZ, circle, footprintRadius, colliderIndex, candidate)
  if (!Number.isFinite(candidate.time)) return
  updateTrajectoryHit(
    entry,
    1 - candidate.time,
    normalX,
    normalZ,
    startY,
    displacementY,
    projectileRadius,
    circle.minimumY,
    circle.maximumY,
    'circle',
    colliderIndex,
    output,
  )
}

function updateTrajectorySegmentHit(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endZ: number,
  displacementY: number,
  segment: ZombieEscapeCollisionSegment,
  footprintRadius: number,
  projectileRadius: number,
  colliderIndex: number,
  output: ZombieEscapeCollisionHit,
  candidate: ZombieEscapeCollisionHit,
) {
  resetCollisionHit(candidate)
  updateSegmentHit(startX, startZ, endX, endZ, segment, footprintRadius, colliderIndex, candidate)
  if (candidate.colliderKind === 'none') return
  const entry = candidate.time
  const normalX = candidate.normalX
  const normalZ = candidate.normalZ

  resetCollisionHit(candidate)
  updateSegmentHit(endX, endZ, startX, startZ, segment, footprintRadius, colliderIndex, candidate)
  if (!Number.isFinite(candidate.time)) return
  updateTrajectoryHit(
    entry,
    1 - candidate.time,
    normalX,
    normalZ,
    startY,
    displacementY,
    projectileRadius,
    segment.minimumY,
    segment.maximumY,
    'segment',
    colliderIndex,
    output,
  )
}

function updateTrajectoryHit(
  footprintEntry: number,
  footprintExit: number,
  footprintNormalX: number,
  footprintNormalZ: number,
  startY: number,
  displacementY: number,
  radius: number,
  colliderMinimumY: number,
  colliderMaximumY: number,
  colliderKind: 'box' | 'circle' | 'segment',
  colliderIndex: number,
  output: ZombieEscapeCollisionHit,
) {
  let verticalEntry = 0
  let verticalExit = 1
  if (Math.abs(displacementY) <= INTERSECTION_EPSILON) {
    if (
      startY < colliderMinimumY - radius - INTERSECTION_EPSILON ||
      startY > colliderMaximumY + radius + INTERSECTION_EPSILON
    ) {
      return
    }
  } else {
    const first = (colliderMinimumY - radius - startY) / displacementY
    const second = (colliderMaximumY + radius - startY) / displacementY
    verticalEntry = Math.max(0, Math.min(first, second))
    verticalExit = Math.min(1, Math.max(first, second))
  }

  const entry = Math.max(0, footprintEntry, verticalEntry)
  const exit = Math.min(1, footprintExit, verticalExit)
  if (entry > exit + INTERSECTION_EPSILON || entry >= output.time) return

  output.colliderIndex = colliderIndex
  output.colliderKind = colliderKind
  if (verticalEntry > footprintEntry + INTERSECTION_EPSILON) {
    output.normalX = 0
    output.normalY = displacementY > 0 ? -1 : 1
    output.normalZ = 0
  } else {
    output.normalX = footprintNormalX
    output.normalY = 0
    output.normalZ = footprintNormalZ
  }
  output.time = entry
}

function updateCircleHit(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  circle: ZombieEscapeCollisionCircle,
  radius: number,
  colliderIndex: number,
  output: ZombieEscapeCollisionHit,
) {
  const amount = segmentCircleFirstIntersectionAmount(
    startX,
    startZ,
    endX,
    endZ,
    circle.x,
    circle.z,
    radius,
  )
  if (amount >= output.time) return
  const displacementX = endX - startX
  const displacementZ = endZ - startZ
  const hitX = startX + displacementX * amount
  const hitZ = startZ + displacementZ * amount
  let normalX = hitX - circle.x
  let normalZ = hitZ - circle.z
  const normalLength = Math.hypot(normalX, normalZ)
  if (normalLength <= INTERSECTION_EPSILON) {
    const displacementLength = Math.hypot(displacementX, displacementZ)
    normalX = displacementLength > INTERSECTION_EPSILON ? -displacementX / displacementLength : 1
    normalZ = displacementLength > INTERSECTION_EPSILON ? -displacementZ / displacementLength : 0
  } else {
    normalX /= normalLength
    normalZ /= normalLength
  }
  output.colliderIndex = colliderIndex
  output.colliderKind = 'circle'
  output.normalX = normalX
  output.normalY = 0
  output.normalZ = normalZ
  output.time = amount
}

function updateBoxHit(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  box: ZombieEscapeCollisionBox,
  radius: number,
  colliderIndex: number,
  output: ZombieEscapeCollisionHit,
) {
  const startOffsetX = startX - box.centerX
  const startOffsetZ = startZ - box.centerZ
  const worldDisplacementX = endX - startX
  const worldDisplacementZ = endZ - startZ
  const localStartX = box.cosine * startOffsetX - box.sine * startOffsetZ
  const localStartZ = box.sine * startOffsetX + box.cosine * startOffsetZ
  const localDisplacementX = box.cosine * worldDisplacementX - box.sine * worldDisplacementZ
  const localDisplacementZ = box.sine * worldDisplacementX + box.cosine * worldDisplacementZ
  const closestX = Math.max(-box.halfWidth, Math.min(box.halfWidth, localStartX))
  const closestZ = Math.max(-box.halfDepth, Math.min(box.halfDepth, localStartZ))
  const outsideX = localStartX - closestX
  const outsideZ = localStartZ - closestZ

  let bestTime = Number.POSITIVE_INFINITY
  let bestLocalNormalX = 0
  let bestLocalNormalZ = 0
  if (outsideX * outsideX + outsideZ * outsideZ <= radius * radius) {
    bestTime = 0
    const outsideLength = Math.hypot(outsideX, outsideZ)
    if (outsideLength > INTERSECTION_EPSILON) {
      bestLocalNormalX = outsideX / outsideLength
      bestLocalNormalZ = outsideZ / outsideLength
    } else {
      const horizontalDistance = box.halfWidth + radius - Math.abs(localStartX)
      const verticalDistance = box.halfDepth + radius - Math.abs(localStartZ)
      if (horizontalDistance < verticalDistance) {
        bestLocalNormalX =
          Math.abs(localStartX) > INTERSECTION_EPSILON
            ? Math.sign(localStartX)
            : localDisplacementX > 0
              ? -1
              : 1
      } else {
        bestLocalNormalZ =
          Math.abs(localStartZ) > INTERSECTION_EPSILON
            ? Math.sign(localStartZ)
            : localDisplacementZ > 0
              ? -1
              : 1
      }
    }
  } else {
    for (const sign of [-1, 1] as const) {
      if (localDisplacementX * sign < -INTERSECTION_EPSILON) {
        const time = (sign * (box.halfWidth + radius) - localStartX) / localDisplacementX
        const hitZ = localStartZ + localDisplacementZ * time
        if (
          time >= 0 &&
          time <= 1 &&
          Math.abs(hitZ) <= box.halfDepth + INTERSECTION_EPSILON &&
          time < bestTime
        ) {
          bestTime = time
          bestLocalNormalX = sign
          bestLocalNormalZ = 0
        }
      }
      if (localDisplacementZ * sign < -INTERSECTION_EPSILON) {
        const time = (sign * (box.halfDepth + radius) - localStartZ) / localDisplacementZ
        const hitX = localStartX + localDisplacementX * time
        if (
          time >= 0 &&
          time <= 1 &&
          Math.abs(hitX) <= box.halfWidth + INTERSECTION_EPSILON &&
          time < bestTime
        ) {
          bestTime = time
          bestLocalNormalX = 0
          bestLocalNormalZ = sign
        }
      }
    }

    for (const signX of [-1, 1] as const) {
      for (const signZ of [-1, 1] as const) {
        const cornerX = signX * box.halfWidth
        const cornerZ = signZ * box.halfDepth
        const time = segmentCircleFirstIntersectionAmount(
          localStartX,
          localStartZ,
          localStartX + localDisplacementX,
          localStartZ + localDisplacementZ,
          cornerX,
          cornerZ,
          radius,
        )
        if (time >= bestTime) continue
        const hitX = localStartX + localDisplacementX * time
        const hitZ = localStartZ + localDisplacementZ * time
        if (
          hitX * signX < box.halfWidth - INTERSECTION_EPSILON ||
          hitZ * signZ < box.halfDepth - INTERSECTION_EPSILON
        ) {
          continue
        }
        const normalX = hitX - cornerX
        const normalZ = hitZ - cornerZ
        const normalLength = Math.hypot(normalX, normalZ)
        if (normalLength <= INTERSECTION_EPSILON) continue
        bestTime = time
        bestLocalNormalX = normalX / normalLength
        bestLocalNormalZ = normalZ / normalLength
      }
    }
  }

  if (bestTime >= output.time) return
  output.colliderIndex = colliderIndex
  output.colliderKind = 'box'
  output.normalX = box.cosine * bestLocalNormalX + box.sine * bestLocalNormalZ
  output.normalY = 0
  output.normalZ = -box.sine * bestLocalNormalX + box.cosine * bestLocalNormalZ
  output.time = bestTime
}

function updateSegmentHit(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  segment: ZombieEscapeCollisionSegment,
  radius: number,
  colliderIndex: number,
  output: ZombieEscapeCollisionHit,
) {
  const segmentX = segment.endX - segment.startX
  const segmentZ = segment.endZ - segment.startZ
  const segmentLength = Math.hypot(segmentX, segmentZ)
  if (segmentLength <= INTERSECTION_EPSILON) {
    if (segment.startCap === 'flat' && segment.endCap === 'flat') return
    updatePointHit(
      startX,
      startZ,
      endX,
      endZ,
      segment.startX,
      segment.startZ,
      radius,
      colliderIndex,
      output,
    )
    return
  }

  const tangentX = segmentX / segmentLength
  const tangentZ = segmentZ / segmentLength
  const normalAxisX = -tangentZ
  const normalAxisZ = tangentX
  const startOffsetX = startX - segment.startX
  const startOffsetZ = startZ - segment.startZ
  const localStartX = startOffsetX * tangentX + startOffsetZ * tangentZ
  const localStartZ = startOffsetX * normalAxisX + startOffsetZ * normalAxisZ
  const displacementX = endX - startX
  const displacementZ = endZ - startZ
  const localDisplacementX = displacementX * tangentX + displacementZ * tangentZ
  const localDisplacementZ = displacementX * normalAxisX + displacementZ * normalAxisZ
  let entry = 0
  let exit = 1
  let entryNormalX = 0
  let entryNormalZ = 0

  if (Math.abs(localDisplacementX) <= INTERSECTION_EPSILON) {
    if (localStartX < 0 || localStartX > segmentLength) entry = Number.POSITIVE_INFINITY
  } else {
    let first = -localStartX / localDisplacementX
    let second = (segmentLength - localStartX) / localDisplacementX
    let normal = -1
    if (first > second) {
      const swap = first
      first = second
      second = swap
      normal = 1
    }
    if (first > entry) {
      entry = first
      entryNormalX = normal * tangentX
      entryNormalZ = normal * tangentZ
    }
    exit = Math.min(exit, second)
    if (entry > exit || exit < 0 || entry > 1) entry = Number.POSITIVE_INFINITY
  }

  if (Number.isFinite(entry)) {
    if (Math.abs(localDisplacementZ) <= INTERSECTION_EPSILON) {
      if (localStartZ < -radius || localStartZ > radius) entry = Number.POSITIVE_INFINITY
    } else {
      let first = (-radius - localStartZ) / localDisplacementZ
      let second = (radius - localStartZ) / localDisplacementZ
      let normal = -1
      if (first > second) {
        const swap = first
        first = second
        second = swap
        normal = 1
      }
      if (first > entry) {
        entry = first
        entryNormalX = normal * normalAxisX
        entryNormalZ = normal * normalAxisZ
      }
      exit = Math.min(exit, second)
      if (entry > exit || exit < 0 || entry > 1) entry = Number.POSITIVE_INFINITY
    }
  }

  let bestTime = entry >= 0 && entry <= 1 ? entry : Number.POSITIVE_INFINITY
  let bestNormalX = entryNormalX
  let bestNormalZ = entryNormalZ
  for (let endpoint = 0; endpoint < 2; endpoint += 1) {
    const rounded = endpoint === 0 ? segment.startCap === 'round' : segment.endCap === 'round'
    if (!rounded) continue
    const centerX = endpoint === 0 ? segment.startX : segment.endX
    const centerZ = endpoint === 0 ? segment.startZ : segment.endZ
    const time = segmentCircleFirstIntersectionAmount(
      startX,
      startZ,
      endX,
      endZ,
      centerX,
      centerZ,
      radius,
    )
    if (time >= bestTime) continue
    let normalX = startX + displacementX * time - centerX
    let normalZ = startZ + displacementZ * time - centerZ
    const normalLength = Math.hypot(normalX, normalZ)
    if (normalLength <= INTERSECTION_EPSILON) {
      const displacementLength = Math.hypot(displacementX, displacementZ)
      normalX = displacementLength > INTERSECTION_EPSILON ? -displacementX / displacementLength : 1
      normalZ = displacementLength > INTERSECTION_EPSILON ? -displacementZ / displacementLength : 0
    } else {
      normalX /= normalLength
      normalZ /= normalLength
    }
    bestTime = time
    bestNormalX = normalX
    bestNormalZ = normalZ
  }

  if (bestTime === 0 && bestNormalX === 0 && bestNormalZ === 0) {
    const nearestAlongDistance = Math.min(Math.max(0, localStartX), segmentLength)
    const closestX = segment.startX + tangentX * nearestAlongDistance
    const closestZ = segment.startZ + tangentZ * nearestAlongDistance
    const normalX = startX - closestX
    const normalZ = startZ - closestZ
    const normalLength = Math.hypot(normalX, normalZ)
    if (normalLength > INTERSECTION_EPSILON) {
      bestNormalX = normalX / normalLength
      bestNormalZ = normalZ / normalLength
    } else {
      const side = localDisplacementZ > 0 ? -1 : 1
      bestNormalX = normalAxisX * side
      bestNormalZ = normalAxisZ * side
    }
  }
  if (bestTime >= output.time) return
  output.colliderIndex = colliderIndex
  output.colliderKind = 'segment'
  output.normalX = bestNormalX
  output.normalY = 0
  output.normalZ = bestNormalZ
  output.time = bestTime
}

function updatePointHit(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  centerX: number,
  centerZ: number,
  radius: number,
  colliderIndex: number,
  output: ZombieEscapeCollisionHit,
) {
  const time = segmentCircleFirstIntersectionAmount(
    startX,
    startZ,
    endX,
    endZ,
    centerX,
    centerZ,
    radius,
  )
  if (time >= output.time) return
  const displacementX = endX - startX
  const displacementZ = endZ - startZ
  let normalX = startX + displacementX * time - centerX
  let normalZ = startZ + displacementZ * time - centerZ
  const normalLength = Math.hypot(normalX, normalZ)
  if (normalLength <= INTERSECTION_EPSILON) {
    const displacementLength = Math.hypot(displacementX, displacementZ)
    normalX = displacementLength > INTERSECTION_EPSILON ? -displacementX / displacementLength : 1
    normalZ = displacementLength > INTERSECTION_EPSILON ? -displacementZ / displacementLength : 0
  } else {
    normalX /= normalLength
    normalZ /= normalLength
  }
  output.colliderIndex = colliderIndex
  output.colliderKind = 'segment'
  output.normalX = normalX
  output.normalY = 0
  output.normalZ = normalZ
  output.time = time
}

function segmentCircleFirstIntersectionAmount(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  centerX: number,
  centerZ: number,
  radius: number,
) {
  const segmentX = endX - startX
  const segmentZ = endZ - startZ
  const offsetX = startX - centerX
  const offsetZ = startZ - centerZ
  const a = segmentX * segmentX + segmentZ * segmentZ
  const c = offsetX * offsetX + offsetZ * offsetZ - radius * radius
  if (c <= 0) return 0
  if (a <= INTERSECTION_EPSILON) return Number.POSITIVE_INFINITY
  const b = 2 * (offsetX * segmentX + offsetZ * segmentZ)
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return Number.POSITIVE_INFINITY
  const root = Math.sqrt(discriminant)
  const first = (-b - root) / (2 * a)
  if (first >= 0 && first <= 1) return first
  const second = (-b + root) / (2 * a)
  return second >= 0 && second <= 1 ? second : Number.POSITIVE_INFINITY
}

function segmentCircleExitIntersectionAmount(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  radius: number,
) {
  const segmentX = endX - startX
  const segmentZ = endZ - startZ
  const a = segmentX * segmentX + segmentZ * segmentZ
  if (a <= INTERSECTION_EPSILON) return Number.POSITIVE_INFINITY
  const startDistanceSquared = startX * startX + startZ * startZ
  if (startDistanceSquared > radius * radius) return 0
  const b = 2 * (startX * segmentX + startZ * segmentZ)
  const c = startDistanceSquared - radius * radius
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return Number.POSITIVE_INFINITY
  const exit = (-b + Math.sqrt(discriminant)) / (2 * a)
  return exit >= 0 && exit <= 1 ? exit : Number.POSITIVE_INFINITY
}

function findNearestWalkableCell(
  world: ZombieEscapeCollisionWorld,
  layerIndex: number,
  column: number,
  row: number,
  breakablesTraversable = false,
) {
  const maximumRadius = Math.max(world.gridWidth, world.gridHeight)
  for (let radius = 0; radius < maximumRadius; radius += 1) {
    for (let rowOffset = -radius; rowOffset <= radius; rowOffset += 1) {
      for (let columnOffset = -radius; columnOffset <= radius; columnOffset += 1) {
        if (Math.max(Math.abs(columnOffset), Math.abs(rowOffset)) !== radius) continue
        const candidateColumn = column + columnOffset
        const candidateRow = row + rowOffset
        if (
          !isGridCellWalkable(
            world,
            layerIndex,
            candidateColumn,
            candidateRow,
            breakablesTraversable,
          )
        ) {
          continue
        }
        return candidateRow * world.gridWidth + candidateColumn
      }
    }
  }
  return -1
}

function isGridCellWalkable(
  world: ZombieEscapeCollisionWorld,
  layerIndex: number,
  column: number,
  row: number,
  breakablesTraversable = false,
) {
  const layer = world.navigationLayers[layerIndex]
  return (
    layer !== undefined &&
    column >= 0 &&
    column < world.gridWidth &&
    row >= 0 &&
    row < world.gridHeight &&
    (breakablesTraversable ? layer.breakableOpenOccupancy : layer.occupancy)[
      row * world.gridWidth + column
    ] === 0
  )
}

function resolveNavigationLayerIndex(world: ZombieEscapeCollisionWorld, elevation: number) {
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < world.navigationLayers.length; index += 1) {
    const distance = Math.abs(elevation - world.navigationLayers[index]!.elevation)
    if (distance >= bestDistance) continue
    bestIndex = index
    bestDistance = distance
  }
  return bestIndex
}

function resolveSupportedNavigationLayerIndex(
  world: ZombieEscapeCollisionWorld,
  x: number,
  z: number,
  elevation: number,
) {
  const column = Math.floor((x - world.gridOriginX) / world.cellSize)
  const row = Math.floor((z - world.gridOriginZ) / world.cellSize)
  let bestIndex = -1
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < world.navigationLayers.length; index += 1) {
    const layer = world.navigationLayers[index]!
    if (!navigationLayerSupportsCell(world, layer, column, row)) continue
    const above = layer.elevation > elevation + NAVIGATION_CONNECTOR_ENTRY_HEIGHT_TOLERANCE_METERS
    const distance = Math.abs(elevation - layer.elevation) + (above ? 1_000 : 0)
    if (distance >= bestDistance) continue
    bestIndex = index
    bestDistance = distance
  }
  return bestIndex >= 0 ? bestIndex : resolveNavigationLayerIndex(world, elevation)
}

function navigationLayerSupportsCell(
  world: ZombieEscapeCollisionWorld,
  layer: ZombieEscapeNavigationLayer,
  column: number,
  row: number,
) {
  return (
    column >= 0 &&
    column < world.gridWidth &&
    row >= 0 &&
    row < world.gridHeight &&
    layer.support[row * world.gridWidth + column] === 1
  )
}

function navigationCellCount(world: ZombieEscapeCollisionWorld) {
  return world.gridWidth * world.gridHeight
}

function navigationNodeCount(world: ZombieEscapeCollisionWorld) {
  return navigationGridNodeCount(world) + world.navigationConnectors.length * 2
}

function navigationGridNodeCount(world: ZombieEscapeCollisionWorld) {
  return navigationCellCount(world) * world.navigationLayers.length
}

function navigationNode(world: ZombieEscapeCollisionWorld, layerIndex: number, cell: number) {
  return layerIndex * navigationCellCount(world) + cell
}

function navigationNodeLayerIndex(world: ZombieEscapeCollisionWorld, node: number) {
  return isGridNavigationNode(world, node) ? Math.floor(node / navigationCellCount(world)) : -1
}

function navigationNodeCell(world: ZombieEscapeCollisionWorld, node: number) {
  return isGridNavigationNode(world, node) ? node % navigationCellCount(world) : -1
}

function isGridNavigationNode(world: ZombieEscapeCollisionWorld, node: number) {
  return node >= 0 && node < navigationGridNodeCount(world)
}

function resolveNavigationNodePlanPosition(world: ZombieEscapeCollisionWorld, node: number) {
  if (isGridNavigationNode(world, node)) {
    const cell = navigationNodeCell(world, node)
    const column = cell % world.gridWidth
    const row = Math.floor(cell / world.gridWidth)
    return {
      x: world.gridOriginX + (column + 0.5) * world.cellSize,
      z: world.gridOriginZ + (row + 0.5) * world.cellSize,
    }
  }
  const endpoint = node - navigationGridNodeCount(world)
  const connector = world.navigationConnectors[Math.floor(endpoint / 2)]
  if (!connector) return { x: 0, z: 0 }
  return endpoint % 2 === 1
    ? { x: connector.endX, z: connector.endZ }
    : { x: connector.startX, z: connector.startZ }
}

function worldColumn(world: ZombieEscapeCollisionWorld, x: number) {
  return clampGridIndex(Math.floor((x - world.gridOriginX) / world.cellSize), world.gridWidth)
}

function worldRow(world: ZombieEscapeCollisionWorld, z: number) {
  return clampGridIndex(Math.floor((z - world.gridOriginZ) / world.cellSize), world.gridHeight)
}

function clampGridIndex(index: number, size: number) {
  return Math.max(0, Math.min(size - 1, index))
}

function resetCollisionHit(hit: ZombieEscapeCollisionHit) {
  hit.colliderIndex = -1
  hit.colliderKind = 'none'
  hit.normalX = 0
  hit.normalY = 0
  hit.normalZ = 0
  hit.time = Number.POSITIVE_INFINITY
}

function createCollisionWorldSemanticKey(
  playRadius: number,
  boundaryPolicy: ZombieEscapeCollisionBoundaryPolicy,
  agentRadius: number,
  cellSize: number,
  broadphaseCellSize: number,
  boxes: readonly ZombieEscapeCollisionBox[],
  circles: readonly ZombieEscapeCollisionCircle[],
  segments: readonly ZombieEscapeCollisionSegment[],
  navigationConnectors: readonly ZombieEscapeNavigationConnector[],
  navigationSupports: readonly ZombieEscapeNavigationSupportSource[],
) {
  return JSON.stringify([
    playRadius,
    boundaryPolicy,
    agentRadius,
    cellSize,
    broadphaseCellSize,
    boxes.map((box) => [
      box.id,
      box.objectId,
      box.breakable,
      box.centerX,
      box.centerZ,
      box.halfWidth,
      box.halfDepth,
      box.rotation,
      serializeVerticalBound(box.minimumY),
      serializeVerticalBound(box.maximumY),
      box.navigationLayerY,
    ]),
    circles.map((circle) => [
      circle.id,
      circle.objectId,
      circle.breakable,
      circle.x,
      circle.z,
      circle.radius,
      serializeVerticalBound(circle.minimumY),
      serializeVerticalBound(circle.maximumY),
      circle.navigationLayerY,
    ]),
    segments.map((segment) => [
      segment.id,
      segment.objectId,
      segment.breakable,
      segment.startX,
      segment.startZ,
      segment.endX,
      segment.endZ,
      segment.halfThickness,
      segment.startCap,
      segment.endCap,
      serializeVerticalBound(segment.minimumY),
      serializeVerticalBound(segment.maximumY),
      segment.navigationLayerY,
    ]),
    navigationConnectors.map((connector) => [
      connector.id,
      connector.objectId,
      connector.ascendingEnd,
      connector.chainId,
      connector.chainLowerY,
      connector.chainOrder,
      connector.chainUpperY,
      connector.startX,
      connector.startY,
      connector.startZ,
      connector.endX,
      connector.endY,
      connector.endZ,
      connector.halfWidth,
    ]),
    navigationSupports.map((support) => [
      support.id,
      support.elevation,
      support.polygon.map(({ x, z }) => [x, z]),
      (support.holes ?? []).map((hole) => hole.map(({ x, z }) => [x, z])),
    ]),
  ])
}

function hashSemanticKey(semanticKey: string) {
  let hash = 0x811c_9dc5
  for (let index = 0; index < semanticKey.length; index += 1) {
    hash ^= semanticKey.charCodeAt(index)
    hash = Math.imul(hash, 0x0100_0193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function serializeVerticalBound(value: number) {
  if (value === Number.NEGATIVE_INFINITY) return '-infinity'
  if (value === Number.POSITIVE_INFINITY) return 'infinity'
  return value
}

function normalizeCircle(circle: ZombieEscapeCollisionCircleSource): ZombieEscapeCollisionCircle {
  const verticalRange = normalizeVerticalRange(circle.minimumY, circle.maximumY)
  return {
    breakable: circle.breakable === true,
    id: circle.id,
    maximumY: verticalRange.maximumY,
    minimumY: verticalRange.minimumY,
    navigationLayerY: normalizeNavigationLayerY(circle.navigationLayerY),
    objectId: circle.objectId ?? circle.id,
    radius: Math.max(0, circle.radius),
    x: circle.x,
    z: circle.z,
  }
}

function normalizeBox(box: ZombieEscapeCollisionBoxSource): ZombieEscapeCollisionBox {
  const verticalRange = normalizeVerticalRange(box.minimumY, box.maximumY)
  const rotation = normalizeAngle(box.rotation)
  return {
    breakable: box.breakable === true,
    centerX: box.centerX,
    centerZ: box.centerZ,
    cosine: Math.cos(rotation),
    halfDepth: Math.max(0, box.halfDepth),
    halfWidth: Math.max(0, box.halfWidth),
    id: box.id,
    maximumY: verticalRange.maximumY,
    minimumY: verticalRange.minimumY,
    navigationLayerY: normalizeNavigationLayerY(box.navigationLayerY),
    objectId: box.objectId ?? box.id,
    rotation,
    sine: Math.sin(rotation),
  }
}

function normalizeNavigationConnector(
  connector: ZombieEscapeNavigationConnectorSource,
): ZombieEscapeNavigationConnector {
  const deltaX = connector.endX - connector.startX
  const deltaZ = connector.endZ - connector.startZ
  const length = Math.hypot(deltaX, deltaZ)
  return {
    ascendingEnd: connector.ascendingEnd,
    chainId: connector.chainId,
    chainLowerY: Math.min(connector.chainLowerY, connector.chainUpperY),
    chainOrder: Math.max(0, Math.trunc(connector.chainOrder)),
    chainUpperY: Math.max(connector.chainLowerY, connector.chainUpperY),
    directionX: deltaX / length,
    directionZ: deltaZ / length,
    endCell: -1,
    endLayerIndex: -1,
    endX: connector.endX,
    endY: connector.endY,
    endZ: connector.endZ,
    halfWidth: Math.max(0, connector.halfWidth),
    id: connector.id,
    length,
    objectId: connector.objectId ?? connector.id,
    startCell: -1,
    startLayerIndex: -1,
    startX: connector.startX,
    startY: connector.startY,
    startZ: connector.startZ,
  }
}

function normalizeNavigationSupport(
  support: ZombieEscapeNavigationSupportSource,
): ZombieEscapeNavigationSupportSource {
  return {
    elevation: support.elevation,
    holes: (support.holes ?? []).map((hole) => hole.map(({ x, z }) => ({ x, z }))),
    id: support.id,
    polygon: support.polygon.map(({ x, z }) => ({ x, z })),
  }
}

function resolveNavigationConnectorCells(
  connectors: readonly ZombieEscapeNavigationConnector[],
  navigationLayers: readonly ZombieEscapeNavigationLayer[],
  gridWidth: number,
  gridHeight: number,
  gridOriginX: number,
  gridOriginZ: number,
  cellSize: number,
  agentRadius: number,
) {
  const landingEndpoints = resolveNavigationConnectorLandingEndpoints(connectors)
  return connectors.map((connector, connectorIndex) => {
    const endLayerIndex = resolveNavigationConnectorLandingLayerIndex(
      navigationLayers,
      connector.endY,
    )
    const startLayerIndex = resolveNavigationConnectorLandingLayerIndex(
      navigationLayers,
      connector.startY,
    )
    return {
      ...connector,
      endCell: landingEndpoints.has(`${String(connectorIndex)}:end`)
        ? resolveNavigationConnectorEndpointCell(
            connector,
            true,
            navigationLayers[endLayerIndex]?.occupancy,
            gridWidth,
            gridHeight,
            gridOriginX,
            gridOriginZ,
            cellSize,
            agentRadius,
          )
        : -1,
      endLayerIndex,
      startCell: landingEndpoints.has(`${String(connectorIndex)}:start`)
        ? resolveNavigationConnectorEndpointCell(
            connector,
            false,
            navigationLayers[startLayerIndex]?.occupancy,
            gridWidth,
            gridHeight,
            gridOriginX,
            gridOriginZ,
            cellSize,
            agentRadius,
          )
        : -1,
      startLayerIndex,
    }
  })
}

function resolveNavigationConnectorLandingEndpoints(
  connectors: readonly ZombieEscapeNavigationConnector[],
) {
  const endpoints = new Set<string>()
  const connectorIndicesByChain = groupNavigationConnectorIndicesByChain(connectors)
  for (const indices of connectorIndicesByChain.values()) {
    const firstIndex = indices[0]
    const lastIndex = indices[indices.length - 1]
    if (firstIndex === undefined || lastIndex === undefined) continue
    const first = connectors[firstIndex]!
    const last = connectors[lastIndex]!
    endpoints.add(`${String(firstIndex)}:${first.ascendingEnd ? 'start' : 'end'}`)
    endpoints.add(`${String(lastIndex)}:${last.ascendingEnd ? 'end' : 'start'}`)
  }
  return endpoints
}

function resolveNavigationConnectorLandingLayerIndex(
  layers: readonly ZombieEscapeNavigationLayer[],
  elevation: number,
) {
  const layerIndex = resolveNavigationLayerIndexFromLayers(layers, elevation)
  const layer = layers[layerIndex]
  return layer &&
    Math.abs(layer.elevation - elevation) <= NAVIGATION_CONNECTOR_TARGET_LANDING_TOLERANCE_METERS
    ? layerIndex
    : -1
}

function resolveNavigationConnectorEndpointCell(
  connector: ZombieEscapeNavigationConnector,
  end: boolean,
  occupancy: Uint8Array | undefined,
  gridWidth: number,
  gridHeight: number,
  gridOriginX: number,
  gridOriginZ: number,
  cellSize: number,
  agentRadius: number,
) {
  if (!occupancy) return -1
  const directionAmount = end ? 1 : -1
  const endpointX = end ? connector.endX : connector.startX
  const endpointZ = end ? connector.endZ : connector.startZ
  const minimumClearance = agentRadius + cellSize
  for (let step = 0; step < 8; step += 1) {
    const clearance = minimumClearance + step * cellSize
    const x = endpointX + connector.directionX * directionAmount * clearance
    const z = endpointZ + connector.directionZ * directionAmount * clearance
    const column = Math.floor((x - gridOriginX) / cellSize)
    const row = Math.floor((z - gridOriginZ) / cellSize)
    if (
      column >= 0 &&
      column < gridWidth &&
      row >= 0 &&
      row < gridHeight &&
      occupancy[row * gridWidth + column] === 0
    ) {
      return row * gridWidth + column
    }
  }
  return -1
}

function createNavigationConnectorAdjacency(
  connectors: readonly ZombieEscapeNavigationConnector[],
  cellCount: number,
  nodeCount: number,
) {
  const edges: ZombieEscapeNavigationConnectorEdge[] = []
  const gridNodeCount = nodeCount - connectors.length * 2
  for (let connectorIndex = 0; connectorIndex < connectors.length; connectorIndex += 1) {
    const connector = connectors[connectorIndex]!
    const startNode = connectorGraphEndpointNode(connectorIndex, false, gridNodeCount)
    const endNode = connectorGraphEndpointNode(connectorIndex, true, gridNodeCount)
    appendBidirectionalNavigationEdge(edges, startNode, endNode)
    if (connector.startCell >= 0 && connector.startLayerIndex >= 0) {
      appendBidirectionalNavigationEdge(
        edges,
        startNode,
        connector.startLayerIndex * cellCount + connector.startCell,
      )
    }
    if (connector.endCell >= 0 && connector.endLayerIndex >= 0) {
      appendBidirectionalNavigationEdge(
        edges,
        endNode,
        connector.endLayerIndex * cellCount + connector.endCell,
      )
    }
  }
  const connectorIndicesByChain = groupNavigationConnectorIndicesByChain(connectors)
  for (const indices of connectorIndicesByChain.values()) {
    for (let order = 0; order < indices.length - 1; order += 1) {
      const firstIndex = indices[order]!
      const secondIndex = indices[order + 1]!
      const first = connectors[firstIndex]!
      const second = connectors[secondIndex]!
      const firstAscendingNode = connectorGraphEndpointNode(
        firstIndex,
        first.ascendingEnd,
        gridNodeCount,
      )
      const secondDescendingNode = connectorGraphEndpointNode(
        secondIndex,
        !second.ascendingEnd,
        gridNodeCount,
      )
      appendBidirectionalNavigationEdge(edges, firstAscendingNode, secondDescendingNode)
    }
  }
  edges.sort((first, second) => first.fromNode - second.fromNode || first.toNode - second.toNode)
  const nodeOffsets = new Uint32Array(nodeCount + 1)
  for (const edge of edges) {
    nodeOffsets[edge.fromNode + 1]! += 1
  }
  for (let node = 0; node < nodeCount; node += 1) {
    nodeOffsets[node + 1] = nodeOffsets[node + 1]! + nodeOffsets[node]!
  }
  const toNodes = new Int32Array(edges.length)
  let edgeIndex = 0
  for (const edge of edges) {
    toNodes[edgeIndex] = edge.toNode
    edgeIndex += 1
  }
  return { nodeOffsets, toNodes }
}

function groupNavigationConnectorIndicesByChain(
  connectors: readonly ZombieEscapeNavigationConnector[],
) {
  const indicesByChain = new Map<string, number[]>()
  for (let index = 0; index < connectors.length; index += 1) {
    const connector = connectors[index]!
    const indices = indicesByChain.get(connector.chainId)
    if (indices) indices.push(index)
    else indicesByChain.set(connector.chainId, [index])
  }
  for (const indices of indicesByChain.values()) {
    indices.sort((first, second) => {
      const firstConnector = connectors[first]!
      const secondConnector = connectors[second]!
      return firstConnector.chainOrder - secondConnector.chainOrder || first - second
    })
  }
  return indicesByChain
}

function appendBidirectionalNavigationEdge(
  edges: ZombieEscapeNavigationConnectorEdge[],
  firstNode: number,
  secondNode: number,
) {
  edges.push({ fromNode: firstNode, toNode: secondNode })
  edges.push({ fromNode: secondNode, toNode: firstNode })
}

function connectorGraphEndpointNode(connectorIndex: number, end: boolean, gridNodeCount: number) {
  return gridNodeCount + connectorIndex * 2 + (end ? 1 : 0)
}

function resolveNavigationLayerIndexFromLayers(
  layers: readonly ZombieEscapeNavigationLayer[],
  elevation: number,
) {
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < layers.length; index += 1) {
    const distance = Math.abs(elevation - layers[index]!.elevation)
    if (distance >= bestDistance) continue
    bestIndex = index
    bestDistance = distance
  }
  return bestIndex
}

function normalizeSegment(
  segment: ZombieEscapeCollisionSegmentSource,
): ZombieEscapeCollisionSegment {
  const verticalRange = normalizeVerticalRange(segment.minimumY, segment.maximumY)
  return {
    breakable: segment.breakable === true,
    endCap: segment.endCap === 'flat' ? 'flat' : 'round',
    endX: segment.endX,
    endZ: segment.endZ,
    halfThickness: Math.max(0, segment.halfThickness),
    id: segment.id,
    maximumY: verticalRange.maximumY,
    minimumY: verticalRange.minimumY,
    navigationLayerY: normalizeNavigationLayerY(segment.navigationLayerY),
    objectId: segment.objectId ?? segment.id,
    startCap: segment.startCap === 'flat' ? 'flat' : 'round',
    startX: segment.startX,
    startZ: segment.startZ,
  }
}

function normalizeNavigationLayerY(value: number | undefined) {
  return Number.isFinite(value) ? (value ?? 0) : 0
}

function normalizeVerticalRange(minimumY: number | undefined, maximumY: number | undefined) {
  const resolvedMinimumY =
    minimumY === undefined || Number.isNaN(minimumY) ? Number.NEGATIVE_INFINITY : minimumY
  const resolvedMaximumY =
    maximumY === undefined || Number.isNaN(maximumY) ? Number.POSITIVE_INFINITY : maximumY
  return {
    maximumY: Math.max(resolvedMinimumY, resolvedMaximumY),
    minimumY: Math.min(resolvedMinimumY, resolvedMaximumY),
  }
}

function verticalRangesOverlap(
  collider: Readonly<{ maximumY: number; minimumY: number }>,
  minimumY: number,
  maximumY: number,
) {
  return collider.maximumY >= minimumY && collider.minimumY <= maximumY
}

function compareCollisionCircles(
  first: ZombieEscapeCollisionCircle,
  second: ZombieEscapeCollisionCircle,
) {
  return (
    first.objectId.localeCompare(second.objectId) ||
    first.id.localeCompare(second.id) ||
    Number(first.breakable) - Number(second.breakable) ||
    first.x - second.x ||
    first.z - second.z ||
    first.radius - second.radius ||
    first.minimumY - second.minimumY ||
    first.maximumY - second.maximumY ||
    first.navigationLayerY - second.navigationLayerY
  )
}

function compareCollisionBoxes(first: ZombieEscapeCollisionBox, second: ZombieEscapeCollisionBox) {
  return (
    first.objectId.localeCompare(second.objectId) ||
    first.id.localeCompare(second.id) ||
    Number(first.breakable) - Number(second.breakable) ||
    first.centerX - second.centerX ||
    first.centerZ - second.centerZ ||
    first.halfWidth - second.halfWidth ||
    first.halfDepth - second.halfDepth ||
    first.rotation - second.rotation ||
    first.minimumY - second.minimumY ||
    first.maximumY - second.maximumY ||
    first.navigationLayerY - second.navigationLayerY
  )
}

function compareCollisionSegments(
  first: ZombieEscapeCollisionSegment,
  second: ZombieEscapeCollisionSegment,
) {
  return (
    first.objectId.localeCompare(second.objectId) ||
    first.id.localeCompare(second.id) ||
    Number(first.breakable) - Number(second.breakable) ||
    first.startX - second.startX ||
    first.startZ - second.startZ ||
    first.endX - second.endX ||
    first.endZ - second.endZ ||
    first.halfThickness - second.halfThickness ||
    first.startCap.localeCompare(second.startCap) ||
    first.endCap.localeCompare(second.endCap) ||
    first.minimumY - second.minimumY ||
    first.maximumY - second.maximumY ||
    first.navigationLayerY - second.navigationLayerY
  )
}

function compareNavigationConnectors(
  first: ZombieEscapeNavigationConnector,
  second: ZombieEscapeNavigationConnector,
) {
  return (
    first.objectId.localeCompare(second.objectId) ||
    first.id.localeCompare(second.id) ||
    Number(first.ascendingEnd) - Number(second.ascendingEnd) ||
    first.chainId.localeCompare(second.chainId) ||
    first.chainLowerY - second.chainLowerY ||
    first.chainOrder - second.chainOrder ||
    first.chainUpperY - second.chainUpperY ||
    first.startX - second.startX ||
    first.startY - second.startY ||
    first.startZ - second.startZ ||
    first.endX - second.endX ||
    first.endY - second.endY ||
    first.endZ - second.endZ ||
    first.halfWidth - second.halfWidth
  )
}

function isFiniteCircle(circle: ZombieEscapeCollisionCircleSource) {
  return (
    [circle.x, circle.z, circle.radius].every(Number.isFinite) &&
    optionalFinite(circle.minimumY) &&
    optionalFinite(circle.maximumY) &&
    optionalStrictFinite(circle.navigationLayerY)
  )
}

function isFiniteBox(box: ZombieEscapeCollisionBoxSource) {
  return (
    [box.centerX, box.centerZ, box.halfDepth, box.halfWidth, box.rotation].every(Number.isFinite) &&
    optionalFinite(box.minimumY) &&
    optionalFinite(box.maximumY) &&
    optionalStrictFinite(box.navigationLayerY)
  )
}

function isFiniteSegment(segment: ZombieEscapeCollisionSegmentSource) {
  return (
    [segment.startX, segment.startZ, segment.endX, segment.endZ, segment.halfThickness].every(
      Number.isFinite,
    ) &&
    optionalFinite(segment.minimumY) &&
    optionalFinite(segment.maximumY) &&
    optionalStrictFinite(segment.navigationLayerY)
  )
}

function isFiniteNavigationConnector(connector: ZombieEscapeNavigationConnectorSource) {
  return (
    [
      connector.startX,
      connector.startY,
      connector.startZ,
      connector.endX,
      connector.endY,
      connector.endZ,
      connector.halfWidth,
      connector.chainLowerY,
      connector.chainOrder,
      connector.chainUpperY,
    ].every(Number.isFinite) &&
    connector.chainId.length > 0 &&
    connector.halfWidth > INTERSECTION_EPSILON &&
    Math.hypot(connector.endX - connector.startX, connector.endZ - connector.startZ) >
      INTERSECTION_EPSILON
  )
}

function isFiniteNavigationSupport(support: ZombieEscapeNavigationSupportSource) {
  return (
    support.id.length > 0 &&
    Number.isFinite(support.elevation) &&
    support.polygon.length >= 3 &&
    support.polygon.every(({ x, z }) => Number.isFinite(x) && Number.isFinite(z)) &&
    (support.holes ?? []).every(
      (hole) =>
        hole.length >= 3 && hole.every(({ x, z }) => Number.isFinite(x) && Number.isFinite(z)),
    )
  )
}

function optionalStrictFinite(value: number | undefined) {
  return value === undefined || Number.isFinite(value)
}

function optionalFinite(value: number | undefined) {
  return value === undefined || !Number.isNaN(value)
}

function finitePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function finiteNonNegative(value: number, fallback: number) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function normalizeAngle(angle: number) {
  const fullTurn = Math.PI * 2
  return ((((angle + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI
}
