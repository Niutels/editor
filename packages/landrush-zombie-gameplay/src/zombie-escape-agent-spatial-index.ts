import type { ZombieEscapeCollisionWorld } from './zombie-escape-collision-world'
import {
  getZombieEscapeZombieCollisionRadiusMeters,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from './zombie-escape-config'

const ZOMBIE_ESCAPE_AGENT_SPATIAL_NEIGHBOR_CELL_COUNT = 9
const ZOMBIE_ESCAPE_AGENT_SPATIAL_EMPTY_LAYER = -1
export const ZOMBIE_ESCAPE_AGENT_SPATIAL_HARD_MAXIMUM_CANDIDATE_INSPECTIONS = 48
export const ZOMBIE_ESCAPE_AGENT_SEPARATION_MAXIMUM_LATERAL_ROUTE_RATIO = 0.45

export type ZombieEscapeAgentSeparation = {
  x: number
  z: number
}

export type ZombieEscapeAgentSpatialIndex = {
  readonly agentCellTableSlots: Int32Array
  readonly agentLayerKeys: Int32Array
  buildCount: number
  readonly capacity: number
  candidateInspectionCount: number
  readonly cellCounts: Uint32Array
  readonly cellKeysX: Int32Array
  readonly cellKeysZ: Int32Array
  readonly cellLayerKeys: Int32Array
  readonly cellOccupants: Int32Array
  readonly cellOffsets: Uint32Array
  readonly cellSizeMeters: number
  readonly cellStamps: Uint32Array
  readonly cellWriteCursors: Uint32Array
  epoch: number
  indexedAgentCount: number
  readonly inverseCellSizeMeters: number
  readonly maximumCandidateInspectionsPerQuery: number
  maximumCandidateInspectionsObserved: number
  maximumNeighborhoodCandidateCountObserved: number
  overflowQueryCount: number
  pairInspectionCount: number
  queryCount: number
  queryCandidateCount: number
  readonly queryCandidateSlots: Int32Array
  readonly queryCellCounts: Uint32Array
  readonly queryCellCursors: Uint32Array
  readonly queryCellTableSlots: Int32Array
  readonly separationRadiusMeters: number
  readonly separationRadiusSquared: number
  separationNeighborCount: number
  readonly separationStrength: number
  readonly tableMask: number
  unindexedAgentCount: number
  readonly verticalToleranceMeters: number
}

export type ZombieEscapeAgentSpatialIndexOptions = Readonly<{
  cellSizeMeters: number
  maximumCandidateInspectionsPerQuery: number
  separationRadiusMeters: number
  separationStrength: number
  verticalToleranceMeters: number
}>

export function createZombieEscapeAgentSeparation(): ZombieEscapeAgentSeparation {
  return { x: 0, z: 0 }
}

export function constrainZombieEscapeAgentSeparationToRoute(
  separation: ZombieEscapeAgentSeparation,
  routeX: number,
  routeZ: number,
  maximumLateralRouteRatio = ZOMBIE_ESCAPE_AGENT_SEPARATION_MAXIMUM_LATERAL_ROUTE_RATIO,
) {
  const routeLength = Math.hypot(routeX, routeZ)
  if (routeLength <= 0.000_1) {
    separation.x = 0
    separation.z = 0
    return separation
  }
  const normalizedRouteX = routeX / routeLength
  const normalizedRouteZ = routeZ / routeLength
  const forwardAmount = separation.x * normalizedRouteX + separation.z * normalizedRouteZ
  const retainedForwardAmount = Math.max(0, forwardAmount)
  let lateralX = separation.x - forwardAmount * normalizedRouteX
  let lateralZ = separation.z - forwardAmount * normalizedRouteZ
  const lateralLength = Math.hypot(lateralX, lateralZ)
  const maximumLateral =
    routeLength *
    Math.max(0, Number.isFinite(maximumLateralRouteRatio) ? maximumLateralRouteRatio : 0)
  if (lateralLength > maximumLateral && lateralLength > 0.000_1) {
    const lateralScale = maximumLateral / lateralLength
    lateralX *= lateralScale
    lateralZ *= lateralScale
  }
  separation.x = retainedForwardAmount * normalizedRouteX + lateralX
  separation.z = retainedForwardAmount * normalizedRouteZ + lateralZ
  return separation
}

export function createZombieEscapeAgentSpatialIndex(
  capacity: number,
  options: ZombieEscapeAgentSpatialIndexOptions,
): ZombieEscapeAgentSpatialIndex {
  const normalizedCapacity = Math.max(1, Math.trunc(capacity))
  const cellSizeMeters = finitePositive(options.cellSizeMeters, 1)
  const tableSize = nextPowerOfTwo(normalizedCapacity * 2)
  const agentCellTableSlots = new Int32Array(normalizedCapacity)
  const agentLayerKeys = new Int32Array(normalizedCapacity)
  const cellLayerKeys = new Int32Array(tableSize)
  const cellOccupants = new Int32Array(normalizedCapacity)
  const queryCandidateSlots = new Int32Array(
    ZOMBIE_ESCAPE_AGENT_SPATIAL_HARD_MAXIMUM_CANDIDATE_INSPECTIONS,
  )
  const queryCellTableSlots = new Int32Array(ZOMBIE_ESCAPE_AGENT_SPATIAL_NEIGHBOR_CELL_COUNT)
  agentCellTableSlots.fill(-1)
  agentLayerKeys.fill(ZOMBIE_ESCAPE_AGENT_SPATIAL_EMPTY_LAYER)
  cellLayerKeys.fill(ZOMBIE_ESCAPE_AGENT_SPATIAL_EMPTY_LAYER)
  cellOccupants.fill(-1)
  queryCandidateSlots.fill(-1)
  queryCellTableSlots.fill(-1)
  const separationRadiusMeters = finitePositive(options.separationRadiusMeters, cellSizeMeters)
  return {
    agentCellTableSlots,
    agentLayerKeys,
    buildCount: 0,
    capacity: normalizedCapacity,
    candidateInspectionCount: 0,
    cellCounts: new Uint32Array(tableSize),
    cellKeysX: new Int32Array(tableSize),
    cellKeysZ: new Int32Array(tableSize),
    cellLayerKeys,
    cellOccupants,
    cellOffsets: new Uint32Array(tableSize + 1),
    cellSizeMeters,
    cellStamps: new Uint32Array(tableSize),
    cellWriteCursors: new Uint32Array(tableSize),
    epoch: 0,
    indexedAgentCount: 0,
    inverseCellSizeMeters: 1 / cellSizeMeters,
    maximumCandidateInspectionsPerQuery: finiteCandidateInspectionLimit(
      options.maximumCandidateInspectionsPerQuery,
    ),
    maximumCandidateInspectionsObserved: 0,
    maximumNeighborhoodCandidateCountObserved: 0,
    overflowQueryCount: 0,
    pairInspectionCount: 0,
    queryCount: 0,
    queryCandidateCount: 0,
    queryCandidateSlots,
    queryCellCounts: new Uint32Array(ZOMBIE_ESCAPE_AGENT_SPATIAL_NEIGHBOR_CELL_COUNT),
    queryCellCursors: new Uint32Array(ZOMBIE_ESCAPE_AGENT_SPATIAL_NEIGHBOR_CELL_COUNT),
    queryCellTableSlots,
    separationRadiusMeters,
    separationRadiusSquared: separationRadiusMeters * separationRadiusMeters,
    separationNeighborCount: 0,
    separationStrength: finiteNonNegative(options.separationStrength, 0),
    tableMask: tableSize - 1,
    unindexedAgentCount: 0,
    verticalToleranceMeters: finiteNonNegative(options.verticalToleranceMeters, 0),
  }
}

export function resetZombieEscapeAgentSpatialIndex(index: ZombieEscapeAgentSpatialIndex) {
  index.agentCellTableSlots.fill(-1)
  index.agentLayerKeys.fill(ZOMBIE_ESCAPE_AGENT_SPATIAL_EMPTY_LAYER)
  index.cellCounts.fill(0)
  index.cellLayerKeys.fill(ZOMBIE_ESCAPE_AGENT_SPATIAL_EMPTY_LAYER)
  index.cellOccupants.fill(-1)
  index.cellOffsets.fill(0)
  index.cellStamps.fill(0)
  index.cellWriteCursors.fill(0)
  index.queryCandidateSlots.fill(-1)
  index.queryCellCounts.fill(0)
  index.queryCellCursors.fill(0)
  index.queryCellTableSlots.fill(-1)
  index.buildCount = 0
  index.candidateInspectionCount = 0
  index.epoch = 0
  index.indexedAgentCount = 0
  index.maximumCandidateInspectionsObserved = 0
  index.maximumNeighborhoodCandidateCountObserved = 0
  index.overflowQueryCount = 0
  index.pairInspectionCount = 0
  index.queryCount = 0
  index.queryCandidateCount = 0
  index.separationNeighborCount = 0
  index.unindexedAgentCount = 0
}

export function rebuildZombieEscapeAgentSpatialIndex(
  index: ZombieEscapeAgentSpatialIndex,
  world: ZombieEscapeCollisionWorld,
  active: Uint8Array,
  health: Float32Array,
  x: Float32Array,
  y: Float32Array,
  z: Float32Array,
  navigationConnector: Int16Array,
) {
  let epoch = (index.epoch + 1) >>> 0
  if (epoch === 0) {
    index.cellStamps.fill(0)
    epoch = 1
  }
  index.epoch = epoch
  index.agentCellTableSlots.fill(-1)
  index.agentLayerKeys.fill(ZOMBIE_ESCAPE_AGENT_SPATIAL_EMPTY_LAYER)
  index.indexedAgentCount = 0
  index.queryCandidateCount = 0
  index.unindexedAgentCount = 0

  const capacity = Math.min(
    index.capacity,
    active.length,
    health.length,
    x.length,
    y.length,
    z.length,
    navigationConnector.length,
  )
  for (let slot = 0; slot < capacity; slot += 1) {
    if (active[slot] === 0 || health[slot]! <= 0) continue
    const layerKey = resolveZombieEscapeAgentSpatialLayerKey(
      world,
      y[slot]!,
      navigationConnector[slot]!,
    )
    const cellX = Math.floor(x[slot]! * index.inverseCellSizeMeters)
    const cellZ = Math.floor(z[slot]! * index.inverseCellSizeMeters)
    const tableSlot = findZombieEscapeAgentSpatialCell(index, layerKey, cellX, cellZ, true)
    if (tableSlot < 0) {
      throw new Error('Zombie Escape agent spatial hash exhausted its reserved table')
    }
    index.agentCellTableSlots[slot] = tableSlot
    index.agentLayerKeys[slot] = layerKey
    index.cellCounts[tableSlot] = index.cellCounts[tableSlot]! + 1
    index.indexedAgentCount += 1
  }

  let occupantOffset = 0
  for (let tableSlot = 0; tableSlot <= index.tableMask; tableSlot += 1) {
    index.cellOffsets[tableSlot] = occupantOffset
    index.cellWriteCursors[tableSlot] = occupantOffset
    if (index.cellStamps[tableSlot] === epoch) occupantOffset += index.cellCounts[tableSlot]!
  }
  index.cellOffsets[index.tableMask + 1] = occupantOffset
  if (occupantOffset !== index.indexedAgentCount) {
    throw new Error('Zombie Escape agent spatial index lost an active agent during its count pass')
  }

  for (let slot = 0; slot < capacity; slot += 1) {
    const tableSlot = index.agentCellTableSlots[slot]!
    if (tableSlot < 0) continue
    const writeOffset = index.cellWriteCursors[tableSlot]!
    index.cellOccupants[writeOffset] = slot
    index.cellWriteCursors[tableSlot] = writeOffset + 1
  }
  index.buildCount += 1
  return index
}

export function resolveZombieEscapeAgentSeparation(
  index: ZombieEscapeAgentSpatialIndex,
  slot: number,
  active: Uint8Array,
  health: Float32Array,
  x: Float32Array,
  y: Float32Array,
  z: Float32Array,
  output: ZombieEscapeAgentSeparation,
) {
  output.x = 0
  output.z = 0
  index.queryCandidateCount = 0
  if (
    slot < 0 ||
    slot >= index.capacity ||
    active[slot] === 0 ||
    health[slot]! <= 0 ||
    index.agentLayerKeys[slot] === ZOMBIE_ESCAPE_AGENT_SPATIAL_EMPTY_LAYER
  ) {
    return output
  }
  index.queryCount += 1

  const sourceX = x[slot]!
  const sourceY = y[slot]!
  const sourceZ = z[slot]!
  const centerCellX = Math.floor(sourceX * index.inverseCellSizeMeters)
  const centerCellZ = Math.floor(sourceZ * index.inverseCellSizeMeters)
  const layerKey = index.agentLayerKeys[slot]!
  let neighborhoodCandidateCount = 0
  let queryCell = 0
  for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const tableSlot = findZombieEscapeAgentSpatialCell(
        index,
        layerKey,
        centerCellX + offsetX,
        centerCellZ + offsetZ,
        false,
      )
      const cellCount = tableSlot >= 0 ? index.cellCounts[tableSlot]! : 0
      index.queryCellTableSlots[queryCell] = tableSlot
      index.queryCellCursors[queryCell] = 0
      index.queryCellCounts[queryCell] = cellCount
      neighborhoodCandidateCount += cellCount
      queryCell += 1
    }
  }
  index.maximumNeighborhoodCandidateCountObserved = Math.max(
    index.maximumNeighborhoodCandidateCountObserved,
    neighborhoodCandidateCount,
  )

  if (neighborhoodCandidateCount <= index.maximumCandidateInspectionsPerQuery) {
    collectAscendingZombieEscapeAgentSpatialCandidates(index, neighborhoodCandidateCount)
  } else {
    collectStratifiedZombieEscapeAgentSpatialCandidates(index, slot, neighborhoodCandidateCount)
    index.overflowQueryCount += 1
  }

  for (let candidate = 0; candidate < index.queryCandidateCount; candidate += 1) {
    const candidateSlot = index.queryCandidateSlots[candidate]!
    index.candidateInspectionCount += 1
    if (candidateSlot === slot) continue
    index.pairInspectionCount += 1
    if (Math.abs(sourceY - y[candidateSlot]!) > index.verticalToleranceMeters) continue
    const separateX = sourceX - x[candidateSlot]!
    const separateZ = sourceZ - z[candidateSlot]!
    const distanceSquared = separateX * separateX + separateZ * separateZ
    if (distanceSquared <= 0.000_1 || distanceSquared >= index.separationRadiusSquared) continue
    const distance = Math.sqrt(distanceSquared)
    const amount =
      ((index.separationRadiusMeters - distance) / index.separationRadiusMeters) *
      index.separationStrength
    output.x += (separateX / distance) * amount
    output.z += (separateZ / distance) * amount
    index.separationNeighborCount += 1
  }
  index.maximumCandidateInspectionsObserved = Math.max(
    index.maximumCandidateInspectionsObserved,
    index.queryCandidateCount,
  )
  return output
}

export function zombieEscapeAgentSpatialPositionIsClear(
  index: ZombieEscapeAgentSpatialIndex,
  layerIndex: number,
  x: number,
  z: number,
  candidateRadius: number,
  variants: Uint8Array,
  agentXs: Float32Array,
  agentZs: Float32Array,
  clearanceEpsilon = 0.01,
) {
  const maximumClearance =
    Math.max(0, candidateRadius) +
    ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS +
    Math.max(0, clearanceEpsilon)
  const cellRadius = Math.ceil(maximumClearance * index.inverseCellSizeMeters)
  const centerCellX = Math.floor(x * index.inverseCellSizeMeters)
  const centerCellZ = Math.floor(z * index.inverseCellSizeMeters)
  for (let offsetZ = -cellRadius; offsetZ <= cellRadius; offsetZ += 1) {
    for (let offsetX = -cellRadius; offsetX <= cellRadius; offsetX += 1) {
      const tableSlot = findZombieEscapeAgentSpatialCell(
        index,
        layerIndex,
        centerCellX + offsetX,
        centerCellZ + offsetZ,
        false,
      )
      if (tableSlot < 0) continue
      const end = index.cellOffsets[tableSlot]! + index.cellCounts[tableSlot]!
      for (let offset = index.cellOffsets[tableSlot]!; offset < end; offset += 1) {
        const slot = index.cellOccupants[offset]!
        const clearance =
          Math.max(0, candidateRadius) +
          getZombieEscapeZombieCollisionRadiusMeters(variants[slot]!) +
          Math.max(0, clearanceEpsilon)
        const deltaX = x - agentXs[slot]!
        const deltaZ = z - agentZs[slot]!
        if (deltaX * deltaX + deltaZ * deltaZ < clearance * clearance) return false
      }
    }
  }
  return true
}

function collectAscendingZombieEscapeAgentSpatialCandidates(
  index: ZombieEscapeAgentSpatialIndex,
  candidateCount: number,
) {
  while (index.queryCandidateCount < candidateCount) {
    let candidateSlot = 0x7fff_ffff
    let candidateCell = -1
    for (let cell = 0; cell < ZOMBIE_ESCAPE_AGENT_SPATIAL_NEIGHBOR_CELL_COUNT; cell += 1) {
      const cursor = index.queryCellCursors[cell]!
      if (cursor >= index.queryCellCounts[cell]!) continue
      const tableSlot = index.queryCellTableSlots[cell]!
      const occupant = index.cellOccupants[index.cellOffsets[tableSlot]! + cursor]!
      if (occupant >= candidateSlot) continue
      candidateSlot = occupant
      candidateCell = cell
    }
    if (candidateCell < 0) {
      throw new Error('Zombie Escape agent spatial query exhausted before its counted candidates')
    }
    index.queryCellCursors[candidateCell] = index.queryCellCursors[candidateCell]! + 1
    index.queryCandidateSlots[index.queryCandidateCount] = candidateSlot
    index.queryCandidateCount += 1
  }
}

function collectStratifiedZombieEscapeAgentSpatialCandidates(
  index: ZombieEscapeAgentSpatialIndex,
  sourceSlot: number,
  neighborhoodCandidateCount: number,
) {
  const sampleCount = index.maximumCandidateInspectionsPerQuery
  let candidateCell = 0
  let candidateCellStart = 0
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const stratumStart = Math.floor((sample * neighborhoodCandidateCount) / sampleCount)
    const stratumEnd = Math.floor(((sample + 1) * neighborhoodCandidateCount) / sampleCount)
    const stratumWidth = stratumEnd - stratumStart
    const samplePhase =
      (index.epoch -
        1 +
        Math.imul(sourceSlot + 1, 0x9e37_79b1) +
        Math.imul(sample + 1, 0x85eb_ca6b)) >>>
      0
    const candidateRank = stratumStart + (samplePhase % stratumWidth)
    while (
      candidateCell < ZOMBIE_ESCAPE_AGENT_SPATIAL_NEIGHBOR_CELL_COUNT &&
      candidateRank >= candidateCellStart + index.queryCellCounts[candidateCell]!
    ) {
      candidateCellStart += index.queryCellCounts[candidateCell]!
      candidateCell += 1
    }
    if (candidateCell >= ZOMBIE_ESCAPE_AGENT_SPATIAL_NEIGHBOR_CELL_COUNT) {
      throw new Error('Zombie Escape agent spatial sample escaped its counted neighborhood')
    }
    const tableSlot = index.queryCellTableSlots[candidateCell]!
    const cellRank = candidateRank - candidateCellStart
    index.queryCandidateSlots[sample] =
      index.cellOccupants[index.cellOffsets[tableSlot]! + cellRank]!
  }
  index.queryCandidateCount = sampleCount
}

function resolveZombieEscapeAgentSpatialLayerKey(
  world: ZombieEscapeCollisionWorld,
  elevation: number,
  connectorIndex: number,
) {
  if (connectorIndex >= 0 && connectorIndex < world.navigationConnectors.length) {
    return world.navigationLayers.length + connectorIndex
  }
  let nearestLayerIndex = 0
  let nearestLayerDistance = Number.POSITIVE_INFINITY
  for (let layerIndex = 0; layerIndex < world.navigationLayers.length; layerIndex += 1) {
    const distance = Math.abs(elevation - world.navigationLayers[layerIndex]!.elevation)
    if (distance >= nearestLayerDistance) continue
    nearestLayerIndex = layerIndex
    nearestLayerDistance = distance
  }
  return nearestLayerIndex
}

function findZombieEscapeAgentSpatialCell(
  index: ZombieEscapeAgentSpatialIndex,
  layerKey: number,
  cellX: number,
  cellZ: number,
  create: boolean,
) {
  let tableSlot = hashZombieEscapeAgentSpatialCell(layerKey, cellX, cellZ) & index.tableMask
  for (let probe = 0; probe <= index.tableMask; probe += 1) {
    if (index.cellStamps[tableSlot] !== index.epoch) {
      if (!create) return -1
      index.cellStamps[tableSlot] = index.epoch
      index.cellLayerKeys[tableSlot] = layerKey
      index.cellKeysX[tableSlot] = cellX
      index.cellKeysZ[tableSlot] = cellZ
      index.cellCounts[tableSlot] = 0
      return tableSlot
    }
    if (
      index.cellLayerKeys[tableSlot] === layerKey &&
      index.cellKeysX[tableSlot] === cellX &&
      index.cellKeysZ[tableSlot] === cellZ
    ) {
      return tableSlot
    }
    tableSlot = (tableSlot + 1) & index.tableMask
  }
  return -1
}

function hashZombieEscapeAgentSpatialCell(layerKey: number, cellX: number, cellZ: number) {
  let hash =
    Math.imul(layerKey, 0x1e35_a7bd) ^ Math.imul(cellX, 0x5f35_6495) ^ Math.imul(cellZ, 0x2c92_7f15)
  hash ^= hash >>> 16
  return hash >>> 0
}

function nextPowerOfTwo(value: number) {
  let result = 1
  while (result < value) result *= 2
  return result
}

function finiteCandidateInspectionLimit(value: number) {
  const normalizedValue = Number.isFinite(value) ? Math.trunc(value) : 0
  return Math.max(
    1,
    Math.min(ZOMBIE_ESCAPE_AGENT_SPATIAL_HARD_MAXIMUM_CANDIDATE_INSPECTIONS, normalizedValue),
  )
}

function finitePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function finiteNonNegative(value: number, fallback: number) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}
