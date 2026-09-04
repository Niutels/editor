import {
  createZombieEscapeCollisionHit,
  resolveZombieEscapePinnedNavigationLayerIndex,
  type ZombieEscapeCollisionHit,
  type ZombieEscapeCollisionWorld,
  zombieEscapeSameLayerNavigationSegmentIsClear,
} from '@landrush/zombie-gameplay/zombie-escape-collision-world'
import {
  inspectZombieEscapeCommittedNavigationAction,
  type ZombieEscapeCommittedNavigationAction,
  type ZombieEscapeSimulation,
} from '@landrush/zombie-gameplay/zombie-escape-simulation'
import {
  resolveSparseNavigationStrictRegionIndex,
  sparseNavigationTargetRegionContainsPoint,
  type ZombieEscapeSparseNavigationTargetRegionIndex,
} from '@landrush/zombie-gameplay/zombie-escape-sparse-navigation'

type ZombieEscapeNavigationFallbackRegionBucketIndex = Readonly<{
  bucketHeight: number
  bucketOffsets: Uint32Array
  bucketRegionIndices: Uint32Array
  bucketSize: number
  bucketWidth: number
  layerCount: number
  minimumBucketX: number
  minimumBucketZ: number
}>

const fallbackRegionBucketIndexByTargetRegionIndex = new WeakMap<
  ZombieEscapeSparseNavigationTargetRegionIndex,
  ZombieEscapeNavigationFallbackRegionBucketIndex
>()

export const ZOMBIE_ESCAPE_NAVIGATION_AGENT_ANOMALY = {
  noCommittedAction: 1 << 0,
  staleRouteGeneration: 1 << 1,
  staleTargetRevision: 1 << 2,
  staleWorldGeneration: 1 << 3,
  unownedRegion: 1 << 4,
  sourceValidationPending: 1 << 5,
  overlappingStrictRegions: 1 << 6,
  stalePoolGeneration: 1 << 7,
} as const

export type ZombieEscapeNavigationAgentInspection = {
  action: ZombieEscapeCommittedNavigationAction
  active: boolean
  anomalyMask: number
  connectorIndex: number
  deferredReasonMask: number
  fallback: boolean
  fallbackClearanceHit: ZombieEscapeCollisionHit
  layerIndex: number
  nextTargetX: number
  nextTargetY: number
  nextTargetZ: number
  nextTargetValid: boolean
  pending: boolean
  poolGeneration: number
  regionIndex: number
  routeGeneration: number
  slot: number
  targetRevision: number
  worldGeneration: number
}

export function createZombieEscapeNavigationAgentInspection(): ZombieEscapeNavigationAgentInspection {
  return {
    action: 'none',
    active: false,
    anomalyMask: 0,
    connectorIndex: -1,
    deferredReasonMask: 0,
    fallback: false,
    fallbackClearanceHit: createZombieEscapeCollisionHit(),
    layerIndex: -1,
    nextTargetX: 0,
    nextTargetY: 0,
    nextTargetZ: 0,
    nextTargetValid: false,
    pending: false,
    poolGeneration: 0,
    regionIndex: -1,
    routeGeneration: 0,
    slot: -1,
    targetRevision: 0,
    worldGeneration: 0,
  }
}

export function inspectZombieEscapeNavigationAgent(
  state: ZombieEscapeSimulation,
  slot: number,
  output: ZombieEscapeNavigationAgentInspection,
) {
  resetZombieEscapeNavigationAgentInspection(output, slot)
  const zombies = state.zombies
  if (
    slot < 0 ||
    slot >= zombies.pool.capacity ||
    zombies.pool.active[slot] === 0 ||
    zombies.health[slot]! <= 0
  ) {
    return false
  }

  const x = zombies.x[slot]!
  const y = zombies.y[slot]!
  const z = zombies.z[slot]!
  const world = state.collisionWorld
  const connectorIndex = zombies.navigationConnector[slot]!
  const layerIndex = resolveZombieEscapePinnedNavigationLayerIndex(world, x, z, y)
  const action = inspectZombieEscapeCommittedNavigationAction(state, slot)
  const hasCachedIntent = zombies.navigationIntentHasCached[slot] !== 0

  output.action = action
  output.active = true
  output.connectorIndex = connectorIndex
  output.deferredReasonMask = zombies.navigationIntentAdmissionDeferredReasons[slot]!
  output.fallback = zombies.navigationWaypointFallback[slot] !== 0
  output.layerIndex = layerIndex
  output.pending = zombies.navigationIntentPending[slot] !== 0
  output.poolGeneration = zombies.pool.generation[slot]!
  output.routeGeneration = zombies.navigationIntentCommittedRouteGeneration[slot]!
  output.targetRevision = zombies.navigationIntentTargetRevision[slot]!
  output.worldGeneration = zombies.navigationIntentWorldGeneration[slot]!
  output.regionIndex = resolveZombieEscapeNavigationAgentRegionIndex(
    world,
    connectorIndex,
    layerIndex,
    x,
    z,
    output.fallbackClearanceHit,
  )

  if (action === 'none') {
    output.anomalyMask |= ZOMBIE_ESCAPE_NAVIGATION_AGENT_ANOMALY.noCommittedAction
  }
  if (connectorIndex < 0 && output.regionIndex < 0) {
    output.anomalyMask |= ZOMBIE_ESCAPE_NAVIGATION_AGENT_ANOMALY.unownedRegion
  }
  if (zombies.navigationSourceNeedsValidation[slot] !== 0) {
    output.anomalyMask |= ZOMBIE_ESCAPE_NAVIGATION_AGENT_ANOMALY.sourceValidationPending
  }
  if (output.worldGeneration !== state.collisionWorldGeneration) {
    output.anomalyMask |= ZOMBIE_ESCAPE_NAVIGATION_AGENT_ANOMALY.staleWorldGeneration
  }
  if (zombies.navigationIntentPoolGeneration[slot] !== output.poolGeneration) {
    output.anomalyMask |= ZOMBIE_ESCAPE_NAVIGATION_AGENT_ANOMALY.stalePoolGeneration
  }
  if (output.targetRevision !== state.navigationTargetRequestedRevision) {
    output.anomalyMask |= ZOMBIE_ESCAPE_NAVIGATION_AGENT_ANOMALY.staleTargetRevision
  }
  if (
    hasCachedIntent &&
    output.routeGeneration !== state.navigationTargetCommittedRouteGeneration
  ) {
    output.anomalyMask |= ZOMBIE_ESCAPE_NAVIGATION_AGENT_ANOMALY.staleRouteGeneration
  }

  writeZombieEscapeNavigationAgentNextTarget(state, slot, output)
  return true
}

function resolveZombieEscapeNavigationAgentRegionIndex(
  world: ZombieEscapeCollisionWorld,
  connectorIndex: number,
  layerIndex: number,
  x: number,
  z: number,
  clearanceHit: ZombieEscapeCollisionHit,
) {
  if (connectorIndex >= 0 || layerIndex < 0) return -1
  const targetRegionIndex = world.navigationGraph.targetRegionIndex
  const strictRegionIndex = resolveSparseNavigationStrictRegionIndex(
    targetRegionIndex,
    layerIndex,
    x,
    z,
  )
  if (strictRegionIndex >= 0) return strictRegionIndex
  const fallbackRegionIndex = resolveZombieEscapeNavigationFallbackRegionIndex(
    targetRegionIndex,
    layerIndex,
    x,
    z,
  )
  const elevation = world.navigationLayers[layerIndex]?.elevation
  if (
    fallbackRegionIndex < 0 ||
    elevation === undefined ||
    !zombieEscapeSameLayerNavigationSegmentIsClear(
      world,
      x,
      elevation,
      z,
      x,
      elevation,
      z,
      world.agentRadius,
      clearanceHit,
    )
  ) {
    return -1
  }
  return fallbackRegionIndex
}

function resolveZombieEscapeNavigationFallbackRegionIndex(
  targetRegionIndex: ZombieEscapeSparseNavigationTargetRegionIndex,
  layerIndex: number,
  x: number,
  z: number,
) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return -1
  const buckets = getZombieEscapeNavigationFallbackRegionBucketIndex(targetRegionIndex)
  if (
    layerIndex < 0 ||
    layerIndex >= buckets.layerCount ||
    buckets.bucketWidth === 0 ||
    buckets.bucketHeight === 0
  ) {
    return -1
  }
  const bucketX = Math.floor(x / buckets.bucketSize) - buckets.minimumBucketX
  const bucketZ = Math.floor(z / buckets.bucketSize) - buckets.minimumBucketZ
  if (
    bucketX < 0 ||
    bucketX >= buckets.bucketWidth ||
    bucketZ < 0 ||
    bucketZ >= buckets.bucketHeight
  ) {
    return -1
  }
  const cell = (layerIndex * buckets.bucketHeight + bucketZ) * buckets.bucketWidth + bucketX
  let matchingRegion = -1
  let matchingWitnessNode = -1
  for (
    let offset = buckets.bucketOffsets[cell]!;
    offset < buckets.bucketOffsets[cell + 1]!;
    offset += 1
  ) {
    const region = buckets.bucketRegionIndices[offset]!
    if (!sparseNavigationTargetRegionContainsPoint(targetRegionIndex, region, x, z)) continue
    const candidateWitnessNode = targetRegionIndex.witnessNodes[region]!
    if (
      candidateWitnessNode >= 0 &&
      (matchingWitnessNode < 0 || candidateWitnessNode < matchingWitnessNode)
    ) {
      matchingRegion = region
      matchingWitnessNode = candidateWitnessNode
    }
  }
  return matchingRegion
}

function getZombieEscapeNavigationFallbackRegionBucketIndex(
  targetRegionIndex: ZombieEscapeSparseNavigationTargetRegionIndex,
) {
  const existing = fallbackRegionBucketIndexByTargetRegionIndex.get(targetRegionIndex)
  if (existing) return existing
  const created = createZombieEscapeNavigationFallbackRegionBucketIndex(targetRegionIndex)
  fallbackRegionBucketIndexByTargetRegionIndex.set(targetRegionIndex, created)
  return created
}

function createZombieEscapeNavigationFallbackRegionBucketIndex(
  targetRegionIndex: ZombieEscapeSparseNavigationTargetRegionIndex,
): ZombieEscapeNavigationFallbackRegionBucketIndex {
  const fallbackRegions: number[] = []
  let layerCount = 0
  let minimumBucketX = Number.POSITIVE_INFINITY
  let minimumBucketZ = Number.POSITIVE_INFINITY
  let maximumBucketX = Number.NEGATIVE_INFINITY
  let maximumBucketZ = Number.NEGATIVE_INFINITY
  for (let region = 0; region < targetRegionIndex.fallbacks.length; region += 1) {
    if (targetRegionIndex.fallbacks[region] === 0) continue
    fallbackRegions.push(region)
    layerCount = Math.max(layerCount, targetRegionIndex.layerIndices[region]! + 1)
    minimumBucketX = Math.min(
      minimumBucketX,
      Math.floor(
        Math.min(
          targetRegionIndex.firstXs[region]!,
          targetRegionIndex.secondXs[region]!,
          targetRegionIndex.thirdXs[region]!,
        ) / targetRegionIndex.bucketSize,
      ),
    )
    minimumBucketZ = Math.min(
      minimumBucketZ,
      Math.floor(
        Math.min(
          targetRegionIndex.firstZs[region]!,
          targetRegionIndex.secondZs[region]!,
          targetRegionIndex.thirdZs[region]!,
        ) / targetRegionIndex.bucketSize,
      ),
    )
    maximumBucketX = Math.max(
      maximumBucketX,
      Math.floor(
        Math.max(
          targetRegionIndex.firstXs[region]!,
          targetRegionIndex.secondXs[region]!,
          targetRegionIndex.thirdXs[region]!,
        ) / targetRegionIndex.bucketSize,
      ),
    )
    maximumBucketZ = Math.max(
      maximumBucketZ,
      Math.floor(
        Math.max(
          targetRegionIndex.firstZs[region]!,
          targetRegionIndex.secondZs[region]!,
          targetRegionIndex.thirdZs[region]!,
        ) / targetRegionIndex.bucketSize,
      ),
    )
  }
  if (fallbackRegions.length === 0) {
    return {
      bucketHeight: 0,
      bucketOffsets: Uint32Array.of(0),
      bucketRegionIndices: new Uint32Array(0),
      bucketSize: targetRegionIndex.bucketSize,
      bucketWidth: 0,
      layerCount: 0,
      minimumBucketX: 0,
      minimumBucketZ: 0,
    }
  }
  const bucketWidth = maximumBucketX - minimumBucketX + 1
  const bucketHeight = maximumBucketZ - minimumBucketZ + 1
  const bucketCounts = new Uint32Array(layerCount * bucketWidth * bucketHeight)
  for (const region of fallbackRegions) {
    forEachZombieEscapeNavigationFallbackRegionBucket(
      targetRegionIndex,
      region,
      minimumBucketX,
      minimumBucketZ,
      bucketWidth,
      bucketHeight,
      (cell) => {
        bucketCounts[cell] = bucketCounts[cell]! + 1
      },
    )
  }
  const bucketOffsets = new Uint32Array(bucketCounts.length + 1)
  for (let cell = 0; cell < bucketCounts.length; cell += 1) {
    bucketOffsets[cell + 1] = bucketOffsets[cell]! + bucketCounts[cell]!
  }
  const bucketRegionIndices = new Uint32Array(bucketOffsets[bucketCounts.length]!)
  const writeOffsets = bucketOffsets.slice(0, -1)
  for (const region of fallbackRegions) {
    forEachZombieEscapeNavigationFallbackRegionBucket(
      targetRegionIndex,
      region,
      minimumBucketX,
      minimumBucketZ,
      bucketWidth,
      bucketHeight,
      (cell) => {
        const offset = writeOffsets[cell]!
        bucketRegionIndices[offset] = region
        writeOffsets[cell] = offset + 1
      },
    )
  }
  return {
    bucketHeight,
    bucketOffsets,
    bucketRegionIndices,
    bucketSize: targetRegionIndex.bucketSize,
    bucketWidth,
    layerCount,
    minimumBucketX,
    minimumBucketZ,
  }
}

function forEachZombieEscapeNavigationFallbackRegionBucket(
  targetRegionIndex: ZombieEscapeSparseNavigationTargetRegionIndex,
  region: number,
  minimumBucketX: number,
  minimumBucketZ: number,
  bucketWidth: number,
  bucketHeight: number,
  callback: (cell: number) => void,
) {
  const regionMinimumBucketX = Math.floor(
    Math.min(
      targetRegionIndex.firstXs[region]!,
      targetRegionIndex.secondXs[region]!,
      targetRegionIndex.thirdXs[region]!,
    ) / targetRegionIndex.bucketSize,
  )
  const regionMinimumBucketZ = Math.floor(
    Math.min(
      targetRegionIndex.firstZs[region]!,
      targetRegionIndex.secondZs[region]!,
      targetRegionIndex.thirdZs[region]!,
    ) / targetRegionIndex.bucketSize,
  )
  const regionMaximumBucketX = Math.floor(
    Math.max(
      targetRegionIndex.firstXs[region]!,
      targetRegionIndex.secondXs[region]!,
      targetRegionIndex.thirdXs[region]!,
    ) / targetRegionIndex.bucketSize,
  )
  const regionMaximumBucketZ = Math.floor(
    Math.max(
      targetRegionIndex.firstZs[region]!,
      targetRegionIndex.secondZs[region]!,
      targetRegionIndex.thirdZs[region]!,
    ) / targetRegionIndex.bucketSize,
  )
  const layerIndex = targetRegionIndex.layerIndices[region]!
  for (let bucketZ = regionMinimumBucketZ; bucketZ <= regionMaximumBucketZ; bucketZ += 1) {
    for (let bucketX = regionMinimumBucketX; bucketX <= regionMaximumBucketX; bucketX += 1) {
      callback(
        (layerIndex * bucketHeight + bucketZ - minimumBucketZ) * bucketWidth +
          bucketX -
          minimumBucketX,
      )
    }
  }
}

function resetZombieEscapeNavigationAgentInspection(
  output: ZombieEscapeNavigationAgentInspection,
  slot: number,
) {
  output.action = 'none'
  output.active = false
  output.anomalyMask = 0
  output.connectorIndex = -1
  output.deferredReasonMask = 0
  output.fallback = false
  output.layerIndex = -1
  output.nextTargetX = 0
  output.nextTargetY = 0
  output.nextTargetZ = 0
  output.nextTargetValid = false
  output.pending = false
  output.poolGeneration = 0
  output.regionIndex = -1
  output.routeGeneration = 0
  output.slot = slot
  output.targetRevision = 0
  output.worldGeneration = 0
}

function writeZombieEscapeNavigationAgentNextTarget(
  state: ZombieEscapeSimulation,
  slot: number,
  output: ZombieEscapeNavigationAgentInspection,
) {
  const zombies = state.zombies
  if (output.connectorIndex >= 0) {
    const connector = state.collisionWorld.navigationConnectors[output.connectorIndex]
    if (connector) {
      const targetEnd = zombies.navigationConnectorTargetEnd[slot] !== 0
      output.nextTargetX = targetEnd ? connector.endX : connector.startX
      output.nextTargetY = targetEnd ? connector.endY : connector.startY
      output.nextTargetZ = targetEnd ? connector.endZ : connector.startZ
      output.nextTargetValid = true
      return
    }
  }

  if (output.action === 'none') return

  if (output.action === 'attack-obstacle') {
    output.nextTargetX = zombies.attackFocusX[slot]!
    output.nextTargetY = zombies.y[slot]!
    output.nextTargetZ = zombies.attackFocusZ[slot]!
    output.nextTargetValid = true
    return
  }
  if (output.action === 'attack-player') {
    output.nextTargetX = state.player.x
    output.nextTargetY = state.player.y
    output.nextTargetZ = state.player.z
    output.nextTargetValid = true
    return
  }

  const waypointNode = zombies.navigationWaypointNode[slot]!
  const graph = state.collisionWorld.navigationGraph
  if (waypointNode >= 0 && waypointNode < graph.nodeIds.length) {
    const waypointLayerIndex = graph.layerIndices[waypointNode]!
    output.nextTargetX = graph.x[waypointNode]!
    output.nextTargetY =
      state.collisionWorld.navigationLayers[waypointLayerIndex]?.elevation ?? zombies.y[slot]!
    output.nextTargetZ = graph.z[waypointNode]!
    output.nextTargetValid = true
    return
  }

  output.nextTargetX = state.navigationGoalX
  output.nextTargetY = state.navigationGoalY
  output.nextTargetZ = state.navigationGoalZ
  output.nextTargetValid = state.navigationGoalInitialized
}
