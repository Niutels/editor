const DEFAULT_NAVIGATION_CELL_SIZE_METERS = 0.25
const DEFAULT_BROADPHASE_CELL_SIZE_METERS = 2
const FLOW_TARGET_CELL_STRIDE = 2
const FLOW_UNREACHABLE = 0xffff_ffff
const COLLISION_EPSILON_METERS = 0.000_5
const COLLISION_SWEEP_ITERATIONS = 3
const INTERSECTION_EPSILON = 0.000_000_1

const FLOW_NEIGHBOR_X = new Int8Array([0, 1, 0, -1, 1, 1, -1, -1])
const FLOW_NEIGHBOR_Z = new Int8Array([-1, 0, 1, 0, -1, 1, 1, -1])

type GridAabbBounds = Readonly<{
  maximumColumn: number
  maximumRow: number
  minimumColumn: number
  minimumRow: number
}>

export type ZombieEscapeCollisionEndCap = 'flat' | 'round'

export type ZombieEscapeCollisionCircleSource = Readonly<{
  id: string
  maximumY?: number
  minimumY?: number
  objectId?: string
  radius: number
  x: number
  z: number
}>

export type ZombieEscapeCollisionSegmentSource = Readonly<{
  endCap?: ZombieEscapeCollisionEndCap
  endX: number
  endZ: number
  halfThickness: number
  id: string
  maximumY?: number
  minimumY?: number
  objectId?: string
  startCap?: ZombieEscapeCollisionEndCap
  startX: number
  startZ: number
}>

export type ZombieEscapeCollisionCircle = Readonly<{
  id: string
  maximumY: number
  minimumY: number
  objectId: string
  radius: number
  x: number
  z: number
}>

export type ZombieEscapeCollisionSegment = Readonly<{
  endCap: ZombieEscapeCollisionEndCap
  endX: number
  endZ: number
  halfThickness: number
  id: string
  maximumY: number
  minimumY: number
  objectId: string
  startCap: ZombieEscapeCollisionEndCap
  startX: number
  startZ: number
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
  broadphase: ZombieEscapeCollisionBroadphase
  cellSize: number
  circles: readonly ZombieEscapeCollisionCircle[]
  gridHeight: number
  gridOriginX: number
  gridOriginZ: number
  gridWidth: number
  occupancy: Uint8Array
  playRadius: number
  revision: string
  segments: readonly ZombieEscapeCollisionSegment[]
  semanticKey: string
}>

export type ZombieEscapeFlowField = {
  distances: Uint32Array
  queue: Int32Array
  reachableCount: number
  rebuildCount: number
  targetBucketX: number
  targetBucketZ: number
  targetCell: number
  world: ZombieEscapeCollisionWorld
}

export type ZombieEscapeFlowSample = {
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
  colliderKind: 'boundary' | 'circle' | 'none' | 'segment'
  normalX: number
  normalZ: number
  time: number
}

export type ZombieEscapeCircleMoveResult = {
  collided: boolean
  x: number
  z: number
}

export function createZombieEscapeCollisionWorld({
  agentRadius,
  broadphaseCellSize = DEFAULT_BROADPHASE_CELL_SIZE_METERS,
  cellSize = DEFAULT_NAVIGATION_CELL_SIZE_METERS,
  circles = [],
  playRadius,
  segments = [],
}: {
  agentRadius: number
  broadphaseCellSize?: number
  cellSize?: number
  circles?: readonly ZombieEscapeCollisionCircleSource[]
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
  const sortedCircles = circles
    .filter(isFiniteCircle)
    .map(normalizeCircle)
    .sort(compareCollisionCircles)
  const sortedSegments = segments
    .filter(isFiniteSegment)
    .map(normalizeSegment)
    .sort(compareCollisionSegments)
  const gridWidth = Math.max(1, Math.ceil((resolvedPlayRadius * 2) / resolvedCellSize))
  const gridHeight = gridWidth
  const gridOriginX = -(gridWidth * resolvedCellSize) / 2
  const gridOriginZ = -(gridHeight * resolvedCellSize) / 2
  const occupancy = new Uint8Array(gridWidth * gridHeight)
  const maximumCenterRadius = Math.max(0, resolvedPlayRadius - resolvedAgentRadius)

  for (let row = 0; row < gridHeight; row += 1) {
    const z = gridOriginZ + (row + 0.5) * resolvedCellSize
    for (let column = 0; column < gridWidth; column += 1) {
      const x = gridOriginX + (column + 0.5) * resolvedCellSize
      if (x * x + z * z > maximumCenterRadius * maximumCenterRadius) {
        occupancy[row * gridWidth + column] = 1
      }
    }
  }

  for (const circle of sortedCircles) {
    rasterizeCircle(
      occupancy,
      gridWidth,
      gridHeight,
      gridOriginX,
      gridOriginZ,
      resolvedCellSize,
      circle,
      resolvedAgentRadius,
    )
  }
  for (const segment of sortedSegments) {
    rasterizeSegment(
      occupancy,
      gridWidth,
      gridHeight,
      gridOriginX,
      gridOriginZ,
      resolvedCellSize,
      segment,
      resolvedAgentRadius,
    )
  }

  const semanticKey = createCollisionWorldSemanticKey(
    resolvedPlayRadius,
    resolvedAgentRadius,
    resolvedCellSize,
    resolvedBroadphaseCellSize,
    sortedCircles,
    sortedSegments,
  )
  return {
    agentRadius: resolvedAgentRadius,
    broadphase: createCollisionBroadphase(
      resolvedPlayRadius,
      resolvedBroadphaseCellSize,
      sortedCircles,
      sortedSegments,
    ),
    cellSize: resolvedCellSize,
    circles: sortedCircles,
    gridHeight,
    gridOriginX,
    gridOriginZ,
    gridWidth,
    occupancy,
    playRadius: resolvedPlayRadius,
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
  const segments = world.segments.filter((segment) => !removedObjectIds.has(segment.objectId))
  if (circles.length === world.circles.length && segments.length === world.segments.length) {
    return world
  }
  return createZombieEscapeCollisionWorld({
    agentRadius: world.agentRadius,
    broadphaseCellSize: world.broadphase.cellSize,
    cellSize: world.cellSize,
    circles,
    playRadius: world.playRadius,
    segments,
  })
}

export function resolveZombieEscapeCollisionHitObjectId(
  world: ZombieEscapeCollisionWorld,
  hit: ZombieEscapeCollisionHit,
) {
  if (hit.colliderKind === 'circle') return world.circles[hit.colliderIndex]?.objectId ?? null
  if (hit.colliderKind === 'segment') return world.segments[hit.colliderIndex]?.objectId ?? null
  return null
}

export function createZombieEscapeFlowField(
  world: ZombieEscapeCollisionWorld,
): ZombieEscapeFlowField {
  const distances = new Uint32Array(world.occupancy.length)
  distances.fill(FLOW_UNREACHABLE)
  return {
    distances,
    queue: new Int32Array(world.occupancy.length),
    reachableCount: 0,
    rebuildCount: 0,
    targetBucketX: -1,
    targetBucketZ: -1,
    targetCell: -1,
    world,
  }
}

export function setZombieEscapeFlowFieldWorld(
  field: ZombieEscapeFlowField,
  world: ZombieEscapeCollisionWorld,
) {
  if (field.world.semanticKey === world.semanticKey) return false
  field.world = world
  field.distances = new Uint32Array(world.occupancy.length)
  field.distances.fill(FLOW_UNREACHABLE)
  field.queue = new Int32Array(world.occupancy.length)
  field.reachableCount = 0
  field.targetBucketX = -1
  field.targetBucketZ = -1
  field.targetCell = -1
  return true
}

export function updateZombieEscapeFlowTarget(
  field: ZombieEscapeFlowField,
  targetX: number,
  targetZ: number,
) {
  const world = field.world
  const targetColumn = worldColumn(world, targetX)
  const targetRow = worldRow(world, targetZ)
  const targetBucketX = Math.floor(targetColumn / FLOW_TARGET_CELL_STRIDE)
  const targetBucketZ = Math.floor(targetRow / FLOW_TARGET_CELL_STRIDE)
  if (
    field.targetCell >= 0 &&
    field.targetBucketX === targetBucketX &&
    field.targetBucketZ === targetBucketZ
  ) {
    return false
  }

  const targetCell = findNearestWalkableCell(world, targetColumn, targetRow)
  field.distances.fill(FLOW_UNREACHABLE)
  field.targetBucketX = targetBucketX
  field.targetBucketZ = targetBucketZ
  field.targetCell = targetCell
  field.reachableCount = 0
  field.rebuildCount += 1
  if (targetCell < 0) return true

  let readIndex = 0
  let writeIndex = 0
  field.queue[writeIndex++] = targetCell
  field.distances[targetCell] = 0
  while (readIndex < writeIndex) {
    const cell = field.queue[readIndex++]!
    const distance = field.distances[cell]!
    const column = cell % world.gridWidth
    const row = Math.floor(cell / world.gridWidth)
    for (let neighbor = 0; neighbor < FLOW_NEIGHBOR_X.length; neighbor += 1) {
      const columnOffset = FLOW_NEIGHBOR_X[neighbor]!
      const rowOffset = FLOW_NEIGHBOR_Z[neighbor]!
      const nextColumn = column + columnOffset
      const nextRow = row + rowOffset
      if (!isGridCellWalkable(world, nextColumn, nextRow)) continue
      if (
        columnOffset !== 0 &&
        rowOffset !== 0 &&
        (!isGridCellWalkable(world, column + columnOffset, row) ||
          !isGridCellWalkable(world, column, row + rowOffset))
      ) {
        continue
      }
      const nextCell = nextRow * world.gridWidth + nextColumn
      if (field.distances[nextCell] !== FLOW_UNREACHABLE) continue
      field.distances[nextCell] = distance + 1
      field.queue[writeIndex++] = nextCell
    }
  }
  field.reachableCount = writeIndex
  return true
}

export function createZombieEscapeReachableSpawn(): ZombieEscapeReachableSpawn {
  return { cell: -1, reachable: false, x: 0, z: 0 }
}

export function resolveZombieEscapeReachableSpawn(
  field: ZombieEscapeFlowField,
  desiredX: number,
  desiredZ: number,
  targetX: number,
  targetZ: number,
  minimumTargetDistanceMeters: number,
  output: ZombieEscapeReachableSpawn,
) {
  updateZombieEscapeFlowTarget(field, targetX, targetZ)
  const world = field.world
  const minimumTargetDistance = Math.max(0, finiteNonNegative(minimumTargetDistanceMeters, 0))
  const minimumTargetDistanceSquared = minimumTargetDistance * minimumTargetDistance
  let bestCell = -1
  let bestDistanceSquared = Number.POSITIVE_INFINITY

  for (let reachableIndex = 0; reachableIndex < field.reachableCount; reachableIndex += 1) {
    const cell = field.queue[reachableIndex]!
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
) {
  const world = field.world
  const directX = targetX - x
  const directZ = targetZ - z
  const directLength = Math.hypot(directX, directZ)
  if (
    directLength > INTERSECTION_EPSILON &&
    zombieEscapeSegmentIsClear(world, x, z, targetX, targetZ, world.agentRadius, collisionHit)
  ) {
    output.x = directX / directLength
    output.z = directZ / directLength
    output.reachable = true
    return output
  }

  const column = worldColumn(world, x)
  const row = worldRow(world, z)
  let bestCell = -1
  let bestDistance = FLOW_UNREACHABLE
  for (let neighbor = 0; neighbor < FLOW_NEIGHBOR_X.length; neighbor += 1) {
    const columnOffset = FLOW_NEIGHBOR_X[neighbor]!
    const rowOffset = FLOW_NEIGHBOR_Z[neighbor]!
    const nextColumn = column + columnOffset
    const nextRow = row + rowOffset
    if (!isGridCellWalkable(world, nextColumn, nextRow)) continue
    if (
      columnOffset !== 0 &&
      rowOffset !== 0 &&
      (!isGridCellWalkable(world, column + columnOffset, row) ||
        !isGridCellWalkable(world, column, row + rowOffset))
    ) {
      continue
    }
    const nextCell = nextRow * world.gridWidth + nextColumn
    const distance = field.distances[nextCell]!
    if (distance >= bestDistance) continue
    bestDistance = distance
    bestCell = nextCell
  }

  if (bestCell < 0 || bestDistance === FLOW_UNREACHABLE) {
    output.x = 0
    output.z = 0
    output.reachable = false
    return output
  }
  const bestColumn = bestCell % world.gridWidth
  const bestRow = Math.floor(bestCell / world.gridWidth)
  const waypointX = world.gridOriginX + (bestColumn + 0.5) * world.cellSize
  const waypointZ = world.gridOriginZ + (bestRow + 0.5) * world.cellSize
  const waypointDirectionX = waypointX - x
  const waypointDirectionZ = waypointZ - z
  const waypointDistance = Math.hypot(waypointDirectionX, waypointDirectionZ)
  output.x = waypointDistance > INTERSECTION_EPSILON ? waypointDirectionX / waypointDistance : 0
  output.z = waypointDistance > INTERSECTION_EPSILON ? waypointDirectionZ / waypointDistance : 0
  output.reachable = true
  return output
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
    normalZ: 0,
    time: Number.POSITIVE_INFINITY,
  }
}

export function createZombieEscapeCircleMoveResult(): ZombieEscapeCircleMoveResult {
  return { collided: false, x: 0, z: 0 }
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
) {
  let x = startX
  let z = startZ
  let remainingX = displacementX
  let remainingZ = displacementZ
  output.collided = false

  const maximumCenterRadius = Math.max(0, world.playRadius - Math.max(0, radius))
  const startRadius = Math.hypot(x, z)
  if (startRadius > maximumCenterRadius) {
    const scale = maximumCenterRadius / Math.max(INTERSECTION_EPSILON, startRadius)
    x *= scale
    z *= scale
    output.collided = true
  }

  for (let iteration = 0; iteration < COLLISION_SWEEP_ITERATIONS; iteration += 1) {
    if (remainingX * remainingX + remainingZ * remainingZ <= INTERSECTION_EPSILON) break
    sweepZombieEscapeCircleAgainstWorld(world, x, z, remainingX, remainingZ, radius, hit)
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
  output.x = x
  output.z = z
  return output
}

export function sweepZombieEscapeCircleAgainstWorld(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startZ: number,
  displacementX: number,
  displacementZ: number,
  radius: number,
  output: ZombieEscapeCollisionHit,
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
) {
  resetCollisionHit(output)
  const endX = startX + displacementX
  const endZ = startZ + displacementZ
  const sweepRadius = Math.max(0, radius)

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
    output.normalZ = -hitZ * inverseLength
    output.time = boundaryAmount
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
          if (!verticalRangesOverlap(segment, minimumY, maximumY)) continue
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
          continue
        }

        const circleIndex = colliderIndex - segmentCount
        const circle = world.circles[circleIndex]!
        if (!verticalRangesOverlap(circle, minimumY, maximumY)) continue
        const amount = segmentCircleFirstIntersectionAmount(
          startX,
          startZ,
          endX,
          endZ,
          circle.x,
          circle.z,
          circle.radius + sweepRadius,
        )
        if (amount >= output.time) continue
        const hitX = startX + displacementX * amount
        const hitZ = startZ + displacementZ * amount
        let normalX = hitX - circle.x
        let normalZ = hitZ - circle.z
        const normalLength = Math.hypot(normalX, normalZ)
        if (normalLength <= INTERSECTION_EPSILON) {
          const displacementLength = Math.hypot(displacementX, displacementZ)
          normalX =
            displacementLength > INTERSECTION_EPSILON ? -displacementX / displacementLength : 1
          normalZ =
            displacementLength > INTERSECTION_EPSILON ? -displacementZ / displacementLength : 0
        } else {
          normalX /= normalLength
          normalZ /= normalLength
        }
        output.colliderIndex = circleIndex
        output.colliderKind = 'circle'
        output.normalX = normalX
        output.normalZ = normalZ
        output.time = amount
      }
    }
  }
  return output
}

function createCollisionBroadphase(
  playRadius: number,
  cellSize: number,
  circles: readonly ZombieEscapeCollisionCircle[],
  segments: readonly ZombieEscapeCollisionSegment[],
): ZombieEscapeCollisionBroadphase {
  const gridWidth = Math.max(1, Math.ceil((playRadius * 2) / cellSize))
  const gridHeight = gridWidth
  const gridOriginX = -(gridWidth * cellSize) / 2
  const gridOriginZ = -(gridHeight * cellSize) / 2
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

  return {
    cellOffsets,
    cellSize,
    colliderIndices,
    gridHeight,
    gridOriginX,
    gridOriginZ,
    gridWidth,
    visitEpoch: new Uint32Array(1),
    visitStamps: new Uint32Array(segments.length + circles.length),
  }
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

function findNearestWalkableCell(world: ZombieEscapeCollisionWorld, column: number, row: number) {
  const maximumRadius = Math.max(world.gridWidth, world.gridHeight)
  for (let radius = 0; radius < maximumRadius; radius += 1) {
    for (let rowOffset = -radius; rowOffset <= radius; rowOffset += 1) {
      for (let columnOffset = -radius; columnOffset <= radius; columnOffset += 1) {
        if (Math.max(Math.abs(columnOffset), Math.abs(rowOffset)) !== radius) continue
        const candidateColumn = column + columnOffset
        const candidateRow = row + rowOffset
        if (!isGridCellWalkable(world, candidateColumn, candidateRow)) continue
        return candidateRow * world.gridWidth + candidateColumn
      }
    }
  }
  return -1
}

function isGridCellWalkable(world: ZombieEscapeCollisionWorld, column: number, row: number) {
  return (
    column >= 0 &&
    column < world.gridWidth &&
    row >= 0 &&
    row < world.gridHeight &&
    world.occupancy[row * world.gridWidth + column] === 0
  )
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
  hit.normalZ = 0
  hit.time = Number.POSITIVE_INFINITY
}

function createCollisionWorldSemanticKey(
  playRadius: number,
  agentRadius: number,
  cellSize: number,
  broadphaseCellSize: number,
  circles: readonly ZombieEscapeCollisionCircle[],
  segments: readonly ZombieEscapeCollisionSegment[],
) {
  return JSON.stringify([
    playRadius,
    agentRadius,
    cellSize,
    broadphaseCellSize,
    circles.map((circle) => [
      circle.id,
      circle.objectId,
      circle.x,
      circle.z,
      circle.radius,
      serializeVerticalBound(circle.minimumY),
      serializeVerticalBound(circle.maximumY),
    ]),
    segments.map((segment) => [
      segment.id,
      segment.objectId,
      segment.startX,
      segment.startZ,
      segment.endX,
      segment.endZ,
      segment.halfThickness,
      segment.startCap,
      segment.endCap,
      serializeVerticalBound(segment.minimumY),
      serializeVerticalBound(segment.maximumY),
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
    id: circle.id,
    maximumY: verticalRange.maximumY,
    minimumY: verticalRange.minimumY,
    objectId: circle.objectId ?? circle.id,
    radius: Math.max(0, circle.radius),
    x: circle.x,
    z: circle.z,
  }
}

function normalizeSegment(
  segment: ZombieEscapeCollisionSegmentSource,
): ZombieEscapeCollisionSegment {
  const verticalRange = normalizeVerticalRange(segment.minimumY, segment.maximumY)
  return {
    endCap: segment.endCap === 'flat' ? 'flat' : 'round',
    endX: segment.endX,
    endZ: segment.endZ,
    halfThickness: Math.max(0, segment.halfThickness),
    id: segment.id,
    maximumY: verticalRange.maximumY,
    minimumY: verticalRange.minimumY,
    objectId: segment.objectId ?? segment.id,
    startCap: segment.startCap === 'flat' ? 'flat' : 'round',
    startX: segment.startX,
    startZ: segment.startZ,
  }
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
    first.x - second.x ||
    first.z - second.z ||
    first.radius - second.radius ||
    first.minimumY - second.minimumY ||
    first.maximumY - second.maximumY
  )
}

function compareCollisionSegments(
  first: ZombieEscapeCollisionSegment,
  second: ZombieEscapeCollisionSegment,
) {
  return (
    first.objectId.localeCompare(second.objectId) ||
    first.id.localeCompare(second.id) ||
    first.startX - second.startX ||
    first.startZ - second.startZ ||
    first.endX - second.endX ||
    first.endZ - second.endZ ||
    first.halfThickness - second.halfThickness ||
    first.startCap.localeCompare(second.startCap) ||
    first.endCap.localeCompare(second.endCap) ||
    first.minimumY - second.minimumY ||
    first.maximumY - second.maximumY
  )
}

function isFiniteCircle(circle: ZombieEscapeCollisionCircleSource) {
  return (
    [circle.x, circle.z, circle.radius].every(Number.isFinite) &&
    optionalFinite(circle.minimumY) &&
    optionalFinite(circle.maximumY)
  )
}

function isFiniteSegment(segment: ZombieEscapeCollisionSegmentSource) {
  return (
    [segment.startX, segment.startZ, segment.endX, segment.endZ, segment.halfThickness].every(
      Number.isFinite,
    ) &&
    optionalFinite(segment.minimumY) &&
    optionalFinite(segment.maximumY)
  )
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
