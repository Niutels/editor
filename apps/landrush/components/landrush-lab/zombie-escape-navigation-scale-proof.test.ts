import { describe, expect, test } from 'bun:test'
import { ZOMBIE_ESCAPE_COLLISION_EPSILON_METERS } from '@landrush/zombie-gameplay/zombie-escape-collision-tolerances'
import {
  classifyZombieEscapeCollisionObjectDelta,
  createZombieEscapeCollisionHit,
  createZombieEscapeCollisionObjectDeltaResult,
  createZombieEscapeCollisionWorld,
  createZombieEscapeSparseCommittedNodeRoute,
  deactivateZombieEscapeCollisionObject,
  resolveZombieEscapeCollisionHitObjectId,
  sampleZombieEscapeSparseCommittedNodeRoute,
  sweepZombieEscapeCircleAgainstWorldInVerticalRange,
  zombieEscapeSegmentIsClearInVerticalRange,
} from '@landrush/zombie-gameplay/zombie-escape-collision-world'
import {
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from '@landrush/zombie-gameplay/zombie-escape-config'
import { createZombieEscapeControlState } from '@landrush/zombie-gameplay/zombie-escape-controls'
import {
  createZombieEscapeSimulation,
  setZombieEscapeCollisionWorld,
  setZombieEscapeExternalPlayerPose,
  setZombieEscapeGamePhase,
  spawnZombieEscapeZombie,
  spawnZombieEscapeZombieAtNavigationElevation,
  stepZombieEscapeSimulationPhysics,
} from '@landrush/zombie-gameplay/zombie-escape-simulation'
import {
  resolveSparseNavigationStrictRegionWitnessNode,
  sparseNavigationTargetRegionContainsPoint,
} from '@landrush/zombie-gameplay/zombie-escape-sparse-navigation'
import { createZombieEscapeArena } from '@landrush/zombie-gameplay/zombie-escape-world'
import {
  assertLandrushZombieEscapeNavigationScaleProofAnchorLayoutCertified,
  classifyLandrushZombieEscapeNavigationScaleProofRepairObservation,
  createLandrushZombieEscapeNavigationScaleProofCertifiedAnchorSet,
  createLandrushZombieEscapeNavigationScaleProofConnectorTraversalTarget,
  createLandrushZombieEscapeNavigationScaleProofOpenWorld,
  createLandrushZombieEscapeNavigationScaleProofTrace,
  inspectLandrushZombieEscapeNavigationScaleProofCurrentCommittedHold,
  inspectLandrushZombieEscapeNavigationScaleProofWorld,
  landrushZombieEscapeNavigationScaleProofFirstServiceBelongsToPublication,
  landrushZombieEscapeNavigationScaleProofPopulationIdentityIsCurrent,
  landrushZombieEscapeNavigationScaleProofTransitionDemandAccountingIsConserved,
  runLandrushZombieEscapeNavigationScaleProof,
  selectLandrushZombieEscapeNavigationScaleProofAnchorNodes,
} from './zombie-escape-navigation-scale-proof'

const PROOF_WORLD_ORIGIN = { x: -24, y: 0, z: -17.5 } as const

type LayeredProofWorldOptions = Readonly<{
  blockingDecoyId?: string
  disconnectedGroundIsland?: boolean
  doorCenterX?: number
  groundUpperLandingNotch?: boolean
  itemBreakable?: boolean
  itemCenterZ?: number
  lowerDivider?: boolean
  upperDivider?: boolean
}>

function createLayeredProofWorld({
  blockingDecoyId,
  disconnectedGroundIsland = false,
  doorCenterX = -3,
  groundUpperLandingNotch = false,
  itemBreakable = true,
  itemCenterZ = 2.25,
  lowerDivider = true,
  upperDivider = true,
}: LayeredProofWorldOptions = {}) {
  return createZombieEscapeCollisionWorld({
    agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
    boundaryPolicy: 'none',
    boxes: [
      {
        breakable: true,
        centerX: doorCenterX,
        centerZ: 1.5,
        halfDepth: 0.35,
        halfWidth: 0.35,
        id: 'door_house_kitchen_back',
        maximumY: 2,
        minimumY: 0,
        navigationLayerY: 0,
        objectId: 'door_house_kitchen_back',
        rotation: 0,
      },
      ...(blockingDecoyId
        ? [
            {
              breakable: true,
              centerX: -3.2,
              centerZ: 1.4,
              halfDepth: 0.08,
              halfWidth: 0.3,
              id: `${blockingDecoyId}:footprint`,
              maximumY: 1.1,
              minimumY: 0,
              navigationLayerY: 0,
              objectId: blockingDecoyId,
              rotation: 0,
            },
          ]
        : []),
      {
        breakable: itemBreakable,
        centerX: -3.2,
        centerZ: itemCenterZ,
        halfDepth: 0.5,
        halfWidth: 1.25,
        id: 'item_g_kitchen_run:footprint',
        maximumY: 1.1,
        minimumY: 0,
        navigationLayerY: 0,
        objectId: 'item_g_kitchen_run',
        rotation: 0,
      },
      ...(lowerDivider
        ? [
            {
              breakable: false,
              centerX: -1.5,
              centerZ: 0,
              halfDepth: 4,
              halfWidth: 0.15,
              id: 'proof-lower-divider',
              maximumY: 2.45,
              minimumY: 0,
              navigationLayerY: 0,
              objectId: 'proof-lower-divider',
              rotation: 0,
            },
          ]
        : []),
      ...(upperDivider
        ? [
            {
              breakable: false,
              centerX: -1.5,
              centerZ: 0,
              halfDepth: 4,
              halfWidth: 0.15,
              id: 'proof-upper-divider',
              maximumY: 5.5,
              minimumY: 2.55,
              navigationLayerY: 3,
              objectId: 'proof-upper-divider',
              rotation: 0,
            },
          ]
        : []),
    ],
    navigationConnectors: [
      {
        ascendingEnd: true,
        chainId: 'proof-stair',
        chainLowerY: 0,
        chainOrder: 0,
        chainUpperY: 3,
        endX: 0,
        endY: 3,
        endZ: 1.5,
        halfWidth: 0.65,
        id: 'proof-stair-flight',
        startX: 0,
        startY: 0,
        startZ: -1.5,
      },
    ],
    navigationSupports: [
      {
        boundary: true,
        elevation: 0,
        id: 'proof-ground',
        polygon: groundUpperLandingNotch
          ? [
              { x: -7, z: -7 },
              { x: 7, z: -7 },
              { x: 7, z: 7 },
              { x: 1, z: 7 },
              { x: 1, z: 0.5 },
              { x: -1, z: 0.5 },
              { x: -1, z: 7 },
              { x: -7, z: 7 },
            ]
          : [
              { x: -7, z: -7 },
              { x: 7, z: -7 },
              { x: 7, z: 7 },
              { x: -7, z: 7 },
            ],
      },
      {
        elevation: 3,
        id: 'proof-upper',
        polygon: [
          { x: -7, z: -7 },
          { x: 7, z: -7 },
          { x: 7, z: 7 },
          { x: -7, z: 7 },
        ],
      },
      ...(disconnectedGroundIsland
        ? [
            {
              elevation: 0,
              id: 'proof-disconnected-ground-island',
              polygon: [
                { x: 8.5, z: -1 },
                { x: 10.5, z: -1 },
                { x: 10.5, z: 1 },
                { x: 8.5, z: 1 },
              ],
            },
          ]
        : []),
    ],
    playRadius: disconnectedGroundIsland ? 12 : 8,
  })
}

function proofSignature(world: ReturnType<typeof createLayeredProofWorld>) {
  return JSON.stringify([
    world.agentRadius,
    world.playRadius,
    -24,
    -17.5,
    0,
    [],
    JSON.stringify([
      ['door', 'door_house_kitchen_back', ['proof-wall'], 1.5, 0.7, false],
      [
        'item',
        'item_g_kitchen_run',
        'proof-ground',
        [-3.2, 0, 2.25],
        [0, 0, 0],
        [1, 1, 1],
        [2.5, 1.1, 1],
        null,
        'solid',
        0,
      ],
      ['compiled-world-fixture', 'closed-breakable-room-door'],
    ]),
  ])
}

function deactivateProofObject(
  world: ReturnType<typeof createLayeredProofWorld>,
  objectId: string,
) {
  const delta = createZombieEscapeCollisionObjectDeltaResult()
  const classification = classifyZombieEscapeCollisionObjectDelta(world, objectId, delta)
  const deactivation = deactivateZombieEscapeCollisionObject(world, delta)
  return { classification, deactivation }
}

function firstTraceBlocker(
  world: ReturnType<typeof createLayeredProofWorld>,
  samples: readonly Readonly<{ x: number; y: number; z: number }>[],
) {
  for (let index = 1; index < samples.length; index += 1) {
    const start = samples[index - 1]!
    const end = samples[index]!
    const hit = createZombieEscapeCollisionHit()
    sweepZombieEscapeCircleAgainstWorldInVerticalRange(
      world,
      start.x,
      start.z,
      end.x - start.x,
      end.z - start.z,
      world.agentRadius,
      start.y + 0.05,
      start.y + 1.8,
      hit,
    )
    if (hit.colliderKind !== 'none') {
      return {
        objectId: resolveZombieEscapeCollisionHitObjectId(world, hit),
        sweepIndex: index - 1,
        time: hit.time,
      }
    }
  }
  return null
}

function resolveStrictRouteFromNode(
  world: ReturnType<typeof createLayeredProofWorld>,
  sourceNode: number,
  targetNode: number,
) {
  const graph = world.navigationGraph
  const distances = new Float64Array(graph.nodeIds.length)
  const firstHops = new Int32Array(graph.nodeIds.length)
  const visited = new Uint8Array(graph.nodeIds.length)
  distances.fill(Number.POSITIVE_INFINITY)
  firstHops.fill(-1)
  distances[sourceNode] = 0
  for (let visit = 0; visit < graph.nodeIds.length; visit += 1) {
    let current = -1
    let currentDistance = Number.POSITIVE_INFINITY
    for (let node = 0; node < graph.nodeIds.length; node += 1) {
      if (
        visited[node] !== 0 ||
        distances[node]! > currentDistance ||
        (distances[node] === currentDistance &&
          current >= 0 &&
          graph.nodeIds[node]!.localeCompare(graph.nodeIds[current]!) >= 0)
      ) {
        continue
      }
      current = node
      currentDistance = distances[node]!
    }
    if (current < 0 || !Number.isFinite(currentDistance)) break
    visited[current] = 1
    if (current === targetNode) break
    const start = graph.strictAdjacency.nodeOffsets[current]!
    const end = graph.strictAdjacency.nodeOffsets[current + 1]!
    for (let edge = start; edge < end; edge += 1) {
      const next = graph.strictAdjacency.toNodes[edge]!
      const distance = currentDistance + graph.strictAdjacency.weights[edge]!
      const firstHop = current === sourceNode ? next : firstHops[current]!
      if (
        distance < distances[next]! ||
        (distance === distances[next]! &&
          (firstHops[next]! < 0 ||
            graph.nodeIds[firstHop]!.localeCompare(graph.nodeIds[firstHops[next]!]!) < 0))
      ) {
        distances[next] = distance
        firstHops[next] = firstHop
      }
    }
  }
  return { distance: distances[targetNode]!, firstHop: firstHops[targetNode]! }
}

function createReadyProofSpawnSimulation(
  world: ReturnType<typeof createLayeredProofWorld>,
  target: Readonly<{ x: number; y: number; z: number }>,
) {
  const arena = createZombieEscapeArena(0x51ca_1e5)
  const state = createZombieEscapeSimulation(arena, 0x51ca_1e5, [], { zombieCapacity: 2 })
  setZombieEscapeExternalPlayerPose(state, true)
  setZombieEscapeCollisionWorld(state, structuredClone(world))
  setZombieEscapeGamePhase(state, 'night')
  state.waveState = 'escape'
  state.waveSpawnRemaining = 0
  state.replacementSpawnRemaining = 0
  state.player.x = target.x
  state.player.y = target.y
  state.player.z = target.z
  const input = createZombieEscapeControlState()
  for (
    let tick = 0;
    tick < 4_096 &&
    (!state.navigationGoalInitialized ||
      state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
      state.navigationTargetCommittedRouteGeneration === 0);
    tick += 1
  ) {
    stepZombieEscapeSimulationPhysics(
      state,
      input,
      ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
      arena,
    )
  }
  expect(state.navigationGoalInitialized).toBe(true)
  expect(state.navigationField.graphSparseTargetUpdate.status).toBe('ready')
  expect(state.navigationTargetCommittedRouteGeneration).toBeGreaterThan(0)
  return state
}

function sampleProofNodeRoute(
  state: ReturnType<typeof createReadyProofSpawnSimulation>,
  node: number,
  fallback: boolean,
) {
  const route = createZombieEscapeSparseCommittedNodeRoute()
  return {
    reachable: sampleZombieEscapeSparseCommittedNodeRoute(
      state.navigationField,
      node,
      fallback,
      route,
    ),
    route,
  }
}

function createDirectProofConnectorPlan(world: ReturnType<typeof createLayeredProofWorld>) {
  const graph = world.navigationGraph
  const connectorIndex = 0
  const connector = world.navigationConnectors[connectorIndex]!
  const endpointNodes = [...graph.nodeIds.keys()].filter(
    (node) => graph.connectorIndices[node] === connectorIndex,
  )
  const nearestEndpoint = (layerIndex: number, x: number, z: number) =>
    endpointNodes.reduce((best, node) => {
      if (graph.layerIndices[node] !== layerIndex) return best
      if (best < 0) return node
      const distance = (graph.x[node]! - x) ** 2 + (graph.z[node]! - z) ** 2
      const bestDistance = (graph.x[best]! - x) ** 2 + (graph.z[best]! - z) ** 2
      return distance < bestDistance ? node : best
    }, -1)
  const startNode = nearestEndpoint(connector.startLayerIndex, connector.startX, connector.startZ)
  const endNode = nearestEndpoint(connector.endLayerIndex, connector.endX, connector.endZ)
  const startElevation = world.navigationLayers[connector.startLayerIndex]!.elevation
  const endElevation = world.navigationLayers[connector.endLayerIndex]!.elevation
  const lowerSourceNode = startElevation < endElevation ? startNode : endNode
  const upperSourceNode = startElevation < endElevation ? endNode : startNode
  return {
    chainId: connector.chainId,
    connectorId: connector.id,
    connectorIndex,
    lowerLayerIndex: graph.layerIndices[lowerSourceNode]!,
    lowerSourceNode,
    lowerTargetNode: lowerSourceNode,
    upperLayerIndex: graph.layerIndices[upperSourceNode]!,
    upperSourceNode,
    upperTargetNode: upperSourceNode,
  }
}

function strictRegionBucketCandidates(
  index: ReturnType<typeof createLayeredProofWorld>['navigationGraph']['targetRegionIndex'],
  layerIndex: number,
  x: number,
  z: number,
) {
  const bucketX = Math.floor(x / index.bucketSize) - index.minimumBucketX
  const bucketZ = Math.floor(z / index.bucketSize) - index.minimumBucketZ
  if (
    layerIndex < 0 ||
    layerIndex >= index.layerCount ||
    bucketX < 0 ||
    bucketX >= index.bucketWidth ||
    bucketZ < 0 ||
    bucketZ >= index.bucketHeight
  ) {
    return []
  }
  const cell = (layerIndex * index.bucketHeight + bucketZ) * index.bucketWidth + bucketX
  return Array.from(
    index.bucketRegionIndices.slice(index.bucketOffsets[cell]!, index.bucketOffsets[cell + 1]!),
  )
}

function setNarrowProofRegion(
  index: ReturnType<typeof createLayeredProofWorld>['navigationGraph']['targetRegionIndex'],
  region: number,
  centerX: number,
  centerZ: number,
  halfWidth: number,
  axis: 'x' | 'z',
) {
  if (axis === 'x') {
    index.firstXs[region] = centerX - halfWidth
    index.firstZs[region] = centerZ - 10
    index.secondXs[region] = centerX + halfWidth
    index.secondZs[region] = centerZ
    index.thirdXs[region] = centerX - halfWidth
    index.thirdZs[region] = centerZ + 10
    return
  }
  index.firstXs[region] = centerX - 10
  index.firstZs[region] = centerZ - halfWidth
  index.secondXs[region] = centerX
  index.secondZs[region] = centerZ + halfWidth
  index.thirdXs[region] = centerX + 10
  index.thirdZs[region] = centerZ - halfWidth
}

describe('Landrush Zombie Escape navigation scale proof', () => {
  test('builds the recorded 60 Hz room trace and a bidirectional live connector plan', () => {
    const world = createLandrushZombieEscapeNavigationScaleProofOpenWorld(
      createLayeredProofWorld(),
      PROOF_WORLD_ORIGIN,
    )
    const trace = createLandrushZombieEscapeNavigationScaleProofTrace(world, PROOF_WORLD_ORIGIN)

    expect(trace.recordedDoorFixedStepCount).toBe(52)
    expect(trace.recordedBuildingScopeId).toBe('parcel:parcel-02')
    expect(trace.recordedBreachBlockerIds).toEqual([
      'door_house_kitchen_back',
      'item_g_kitchen_run',
    ])
    expect(trace.recordedDoorId).toBe('door_house_kitchen_back')
    expect(trace.recordedLevelId).toBe('level_landrush-parcel-1msovbflbvkdc-0')
    expect(trace.recordedOutsideWorld).toEqual({ x: -27, y: 0, z: -17.5 })
    expect(trace.recordedInsideWorld).toEqual({ x: -27, y: 0, z: -14.5 })
    expect(trace.samples).toHaveLength(53)
    expect(trace.requestCount).toBe(53)
    expect(trace.connector.chainId).toBe('proof-stair')
    expect(trace.connector.connectorId).toBe('proof-stair-flight')
    expect(trace.connector.lowerLayerIndex).not.toBe(trace.connector.upperLayerIndex)
    expect(trace.samples[0]).toMatchObject({ index: 0, x: -3, y: 0, z: 0 })
    expect(trace.samples[52]).toMatchObject({ index: 52, x: -3, y: 0, z: 3 })
    expect(trace.hash).toMatch(/^[0-9a-f]{16}$/)
  })

  test('selects an exact bidirectional connector when its upper landing is open', () => {
    const world = createLandrushZombieEscapeNavigationScaleProofOpenWorld(
      createLayeredProofWorld({ upperDivider: false }),
      PROOF_WORLD_ORIGIN,
    )
    const trace = createLandrushZombieEscapeNavigationScaleProofTrace(world, PROOF_WORLD_ORIGIN)
    const graph = world.navigationGraph
    const connector = trace.connector
    const hasStrictEdge = (sourceNode: number, targetNode: number) => {
      const start = graph.strictAdjacency.nodeOffsets[sourceNode]!
      const end = graph.strictAdjacency.nodeOffsets[sourceNode + 1]!
      for (let edge = start; edge < end; edge += 1) {
        if (graph.strictAdjacency.toNodes[edge] === targetNode) return true
      }
      return false
    }
    const upperLayer = world.navigationLayers[connector.upperLayerIndex]!
    const upperRoute = resolveStrictRouteFromNode(
      world,
      connector.lowerSourceNode,
      connector.upperTargetNode,
    )
    const connectorLength = world.navigationConnectors[connector.connectorIndex]!.length

    expect(hasStrictEdge(connector.lowerSourceNode, connector.upperSourceNode)).toBe(true)
    expect(hasStrictEdge(connector.upperSourceNode, connector.lowerSourceNode)).toBe(true)
    expect(graph.fallbackComponentIndices[connector.lowerSourceNode]).toBe(
      graph.fallbackComponentIndices[connector.upperSourceNode],
    )
    expect(graph.layerIndices[connector.upperTargetNode]).toBe(connector.upperLayerIndex)
    expect(connector.upperTargetNode).not.toBe(connector.upperSourceNode)
    expect(upperRoute.firstHop).toBe(connector.upperSourceNode)
    expect(upperRoute.distance).toBeGreaterThanOrEqual(connectorLength + 1.5)
    expect(
      zombieEscapeSegmentIsClearInVerticalRange(
        world,
        graph.x[connector.upperSourceNode]!,
        graph.z[connector.upperSourceNode]!,
        graph.x[connector.upperTargetNode]!,
        graph.z[connector.upperTargetNode]!,
        world.agentRadius,
        upperLayer.elevation + 0.05,
        upperLayer.elevation + 1.8,
      ),
    ).toBe(true)
  })

  test('pins downward traversal to an authenticated lower-layer target beyond combat reach', () => {
    const world = createLandrushZombieEscapeNavigationScaleProofOpenWorld(
      createLayeredProofWorld({ upperDivider: false }),
      PROOF_WORLD_ORIGIN,
    )
    const plan = createLandrushZombieEscapeNavigationScaleProofTrace(
      world,
      PROOF_WORLD_ORIGIN,
    ).connector
    const target = createLandrushZombieEscapeNavigationScaleProofConnectorTraversalTarget(
      world,
      plan,
      'upper-to-lower',
    )
    const connector = world.navigationConnectors[plan.connectorIndex]!
    const route = resolveStrictRouteFromNode(world, plan.upperSourceNode, plan.lowerTargetNode)
    const directionAmount = connector.ascendingEnd ? -1 : 1
    const endpointX = connector.ascendingEnd ? connector.startX : connector.endX
    const endpointZ = connector.ascendingEnd ? connector.startZ : connector.endZ
    const signedExitProjection =
      ((target.x - endpointX) * connector.directionX +
        (target.z - endpointZ) * connector.directionZ) *
      directionAmount
    const requiredClearance =
      world.agentRadius +
      ZOMBIE_ESCAPE_COLLISION_EPSILON_METERS +
      ZOMBIE_ESCAPE_SIMULATION.zombiePlayerAttackReachMeters +
      world.agentRadius +
      ZOMBIE_ESCAPE_COLLISION_EPSILON_METERS
    const state = createReadyProofSpawnSimulation(world, target)

    expect(target).toEqual({
      x: world.navigationGraph.x[plan.lowerTargetNode],
      y: world.navigationLayers[plan.lowerLayerIndex]!.elevation,
      z: world.navigationGraph.z[plan.lowerTargetNode],
    })
    expect(route.firstHop).toBe(plan.lowerSourceNode)
    expect(signedExitProjection).toBeGreaterThan(requiredClearance)
    expect(state.navigationGoalLayerIndex).toBe(plan.lowerLayerIndex)
    expect(state.navigationGoalX).toBe(target.x)
    expect(state.navigationGoalY).toBe(target.y)
    expect(state.navigationGoalZ).toBe(target.z)
    expect(() =>
      createLandrushZombieEscapeNavigationScaleProofConnectorTraversalTarget(
        world,
        { ...plan, lowerTargetNode: plan.lowerSourceNode },
        'upper-to-lower',
      ),
    ).toThrow('not an authenticated clear landing exit')
  })

  test('fingerprints topology independently from the active mask and authenticates semantics', () => {
    const world = createLayeredProofWorld()
    const signature = proofSignature(world)
    const baseline = inspectLandrushZombieEscapeNavigationScaleProofWorld(world, signature)
    const topologyMutation = structuredClone(world)
    topologyMutation.navigationGraph.x[0] = topologyMutation.navigationGraph.x[0]! + 0.25
    const changedTopology = inspectLandrushZombieEscapeNavigationScaleProofWorld(
      topologyMutation,
      signature,
    )
    const activeMaskMutation = structuredClone(world)
    activeMaskMutation.activeObjectMask[0] = activeMaskMutation.activeObjectMask[0] === 0 ? 1 : 0
    const changedMask = inspectLandrushZombieEscapeNavigationScaleProofWorld(
      activeMaskMutation,
      signature,
    )
    const literalSubstitute = inspectLandrushZombieEscapeNavigationScaleProofWorld(
      world,
      JSON.stringify([
        world.agentRadius,
        world.playRadius,
        -24,
        -17.5,
        0,
        [],
        JSON.stringify([
          ['literal-door-id', 'door_house_kitchen_back'],
          ['literal-world-semantic-key', world.semanticKey],
        ]),
      ]),
    )

    expect(signature.includes(world.semanticKey)).toBe(false)
    expect(baseline.requiredDoorClosedBreakable).toBe(true)
    expect(literalSubstitute.requiredDoorClosedBreakable).toBe(false)
    expect(changedTopology.topologyHash).not.toBe(baseline.topologyHash)
    expect(changedTopology.activeMaskHash).toBe(baseline.activeMaskHash)
    expect(changedMask.topologyHash).toBe(baseline.topologyHash)
    expect(changedMask.activeMaskHash).not.toBe(baseline.activeMaskHash)
  })

  test('authenticates the ordered breakable blocker chain and opens only its cloned proof view', () => {
    const closedWorld = createLayeredProofWorld()
    const signature = proofSignature(closedWorld)
    const sourceFingerprintBefore = inspectLandrushZombieEscapeNavigationScaleProofWorld(
      closedWorld,
      signature,
    )
    const sourceMaskBefore = Array.from(closedWorld.activeObjectMask)
    const openWorld = createLandrushZombieEscapeNavigationScaleProofOpenWorld(
      closedWorld,
      PROOF_WORLD_ORIGIN,
    )
    const trace = createLandrushZombieEscapeNavigationScaleProofTrace(openWorld, PROOF_WORLD_ORIGIN)

    expect(trace.recordedBreachBlockerIds).toEqual([
      'door_house_kitchen_back',
      'item_g_kitchen_run',
    ])
    expect(firstTraceBlocker(openWorld, trace.samples)).toBeNull()
    expect(firstTraceBlocker(closedWorld, trace.samples)).toMatchObject({
      objectId: 'door_house_kitchen_back',
    })
    expect(firstTraceBlocker(closedWorld, trace.samples)!.time).toBeGreaterThan(0)

    const doorOnlyWorld = structuredClone(closedWorld)
    expect(deactivateProofObject(doorOnlyWorld, 'door_house_kitchen_back')).toEqual({
      classification: 'changed',
      deactivation: 'changed',
    })
    expect(firstTraceBlocker(doorOnlyWorld, trace.samples)).toMatchObject({
      objectId: 'item_g_kitchen_run',
    })
    expect(firstTraceBlocker(doorOnlyWorld, trace.samples)!.time).toBeGreaterThan(0)

    expect(openWorld.semanticKey).toBe(closedWorld.semanticKey)
    expect(openWorld.revision).not.toBe(closedWorld.revision)
    expect(closedWorld.breakableObjectIds.has('door_house_kitchen_back')).toBe(true)
    expect(closedWorld.breakableObjectIds.has('item_g_kitchen_run')).toBe(true)
    expect(proofSignature(closedWorld)).toContain('door_house_kitchen_back')
    expect(proofSignature(closedWorld)).toContain('item_g_kitchen_run')
    for (const blockerId of trace.recordedBreachBlockerIds) {
      const sourceOrdinal = closedWorld.objectCatalog.objectIds.indexOf(blockerId)
      const openOrdinal = openWorld.objectCatalog.objectIds.indexOf(blockerId)
      expect(sourceOrdinal).toBeGreaterThanOrEqual(0)
      expect(openOrdinal).toBeGreaterThanOrEqual(0)
      expect(closedWorld.activeObjectMask[sourceOrdinal]).toBe(1)
      expect(openWorld.activeObjectMask[openOrdinal]).toBe(0)
    }
    expect(Array.from(closedWorld.activeObjectMask)).toEqual(sourceMaskBefore)
    expect(inspectLandrushZombieEscapeNavigationScaleProofWorld(closedWorld, signature)).toEqual(
      sourceFingerprintBefore,
    )

    const displacedDoorWorld = createLayeredProofWorld({ doorCenterX: 4 })
    expect(
      inspectLandrushZombieEscapeNavigationScaleProofWorld(
        displacedDoorWorld,
        proofSignature(displacedDoorWorld),
      ).requiredDoorClosedBreakable,
    ).toBe(true)
    expect(() =>
      createLandrushZombieEscapeNavigationScaleProofOpenWorld(
        displacedDoorWorld,
        PROOF_WORLD_ORIGIN,
      ),
    ).toThrow(/expected recorded blocker door_house_kitchen_back but hit item_g_kitchen_run/u)
  })

  test('fails closed on reordered, wrong-id, inactive, or non-breakable recorded blockers', () => {
    expect(() =>
      createLandrushZombieEscapeNavigationScaleProofOpenWorld(
        createLayeredProofWorld({ itemCenterZ: 0.9 }),
        PROOF_WORLD_ORIGIN,
      ),
    ).toThrow(/expected recorded blocker door_house_kitchen_back but hit item_g_kitchen_run/u)

    expect(() =>
      createLandrushZombieEscapeNavigationScaleProofOpenWorld(
        createLayeredProofWorld({ blockingDecoyId: 'item_g_kitchen_wrong' }),
        PROOF_WORLD_ORIGIN,
      ),
    ).toThrow(/expected recorded blocker item_g_kitchen_run but hit item_g_kitchen_wrong/u)

    const inactiveWorld = createLayeredProofWorld()
    expect(deactivateProofObject(inactiveWorld, 'item_g_kitchen_run')).toEqual({
      classification: 'changed',
      deactivation: 'changed',
    })
    expect(() =>
      createLandrushZombieEscapeNavigationScaleProofOpenWorld(inactiveWorld, PROOF_WORLD_ORIGIN),
    ).toThrow(
      /recorded blocker item_g_kitchen_run is not an active breakable mask-removable collider/u,
    )

    expect(() =>
      createLandrushZombieEscapeNavigationScaleProofOpenWorld(
        createLayeredProofWorld({ itemBreakable: false }),
        PROOF_WORLD_ORIGIN,
      ),
    ).toThrow(
      /recorded blocker item_g_kitchen_run is not an active breakable mask-removable collider/u,
    )
  })

  test('certifies an upper-layer admission whose XZ is invalid at ground elevation', () => {
    const world = createLayeredProofWorld({
      groundUpperLandingNotch: true,
      upperDivider: false,
    })
    const openWorld = createLandrushZombieEscapeNavigationScaleProofOpenWorld(
      world,
      PROOF_WORLD_ORIGIN,
    )
    const trace = createLandrushZombieEscapeNavigationScaleProofTrace(openWorld, PROOF_WORLD_ORIGIN)
    const upperSourceNode = trace.connector.upperSourceNode
    const upperSourceLayerIndex = openWorld.navigationGraph.layerIndices[upperSourceNode]!
    const upperSourceLayer = openWorld.navigationLayers[upperSourceLayerIndex]!
    const spawnState = createReadyProofSpawnSimulation(openWorld, trace.samples[0]!)
    const upperSourceX = openWorld.navigationGraph.x[upperSourceNode]!
    const upperSourceZ = openWorld.navigationGraph.z[upperSourceNode]!

    expect(spawnZombieEscapeZombie(spawnState, upperSourceX, upperSourceZ, 1_000_000)).toBe(-1)
    expect(
      spawnZombieEscapeZombieAtNavigationElevation(
        spawnState,
        upperSourceX,
        upperSourceZ,
        upperSourceLayer.elevation,
        1_000_000,
      ),
    ).toBe(0)
    expect(spawnState.zombies.y[0]).toBe(upperSourceLayer.elevation)
    expect(spawnState.zombies.navigationSourceCertifiedY[0]).toBe(upperSourceLayer.elevation)
    expect(
      openWorld.navigationGraph.layerIndices[spawnState.zombies.navigationWaypointNode[0]!],
    ).toBe(upperSourceLayerIndex)
    expect(spawnState.zombies.navigationIntentCommittedRouteGeneration[0]).toBe(
      spawnState.navigationTargetCommittedRouteGeneration,
    )
  })

  test('rejects stale first-service attribution and incomplete immediate adoption', () => {
    const world = createLandrushZombieEscapeNavigationScaleProofOpenWorld(
      createLayeredProofWorld({ upperDivider: false }),
      PROOF_WORLD_ORIGIN,
    )
    const trace = createLandrushZombieEscapeNavigationScaleProofTrace(world, PROOF_WORLD_ORIGIN)
    const sourceNode = trace.connector.lowerSourceNode
    const sourceLayerIndex = world.navigationGraph.layerIndices[sourceNode]!
    const sourceLayer = world.navigationLayers[sourceLayerIndex]!
    const state = createReadyProofSpawnSimulation(world, trace.samples[0]!)
    const slot = spawnZombieEscapeZombieAtNavigationElevation(
      state,
      world.navigationGraph.x[sourceNode]!,
      world.navigationGraph.z[sourceNode]!,
      sourceLayer.elevation,
      1_000_000,
    )
    expect(slot).toBe(0)
    const committedGeneration = state.navigationTargetCommittedRouteGeneration
    expect(
      inspectLandrushZombieEscapeNavigationScaleProofCurrentCommittedHold(
        state,
        slot,
        committedGeneration,
      ),
    ).toBe(true)
    const expectedPoolGenerations = state.zombies.pool.generation.slice(0, 1)
    expect(
      landrushZombieEscapeNavigationScaleProofPopulationIdentityIsCurrent(
        state,
        expectedPoolGenerations,
        1,
      ),
    ).toBe(true)
    state.zombies.pool.generation[slot] = state.zombies.pool.generation[slot]! + 1
    expect(
      landrushZombieEscapeNavigationScaleProofPopulationIdentityIsCurrent(
        state,
        expectedPoolGenerations,
        1,
      ),
    ).toBe(false)
    state.zombies.pool.generation[slot] = expectedPoolGenerations[slot]!

    const publicationNavigationIntentTick = state.navigationIntentTick
    expect(
      landrushZombieEscapeNavigationScaleProofFirstServiceBelongsToPublication(
        1,
        publicationNavigationIntentTick - 1,
        publicationNavigationIntentTick,
      ),
    ).toBe(false)
    expect(
      landrushZombieEscapeNavigationScaleProofFirstServiceBelongsToPublication(
        1,
        publicationNavigationIntentTick,
        publicationNavigationIntentTick,
      ),
    ).toBe(true)
    expect(
      landrushZombieEscapeNavigationScaleProofFirstServiceBelongsToPublication(
        0,
        publicationNavigationIntentTick,
        publicationNavigationIntentTick,
      ),
    ).toBe(false)

    expect(state.zombies.navigationIntentCommittedRouteGeneration[slot]).toBe(committedGeneration)
    expect(state.zombies.navigationIntentValid[slot]).toBe(1)
    expect(state.zombies.navigationIntentPending[slot]).toBe(0)
    state.zombies.navigationIntentWorldGeneration[slot] = state.collisionWorldGeneration + 1
    expect(
      inspectLandrushZombieEscapeNavigationScaleProofCurrentCommittedHold(
        state,
        slot,
        committedGeneration,
      ),
    ).toBe(false)
  })

  test('freezes repair classification at the first current hold across later re-demand', () => {
    const inlineHold = classifyLandrushZombieEscapeNavigationScaleProofRepairObservation(
      false,
      false,
      false,
      true,
    )
    expect(inlineHold).toEqual({
      firstService: false,
      hold: true,
      inlineRecoveryWithoutFirstService: true,
    })
    expect(
      classifyLandrushZombieEscapeNavigationScaleProofRepairObservation(
        false,
        inlineHold.hold,
        true,
        true,
      ),
    ).toEqual({
      firstService: false,
      hold: false,
      inlineRecoveryWithoutFirstService: false,
    })

    const serviceBeforeHold = classifyLandrushZombieEscapeNavigationScaleProofRepairObservation(
      false,
      false,
      true,
      false,
    )
    expect(serviceBeforeHold).toEqual({
      firstService: true,
      hold: false,
      inlineRecoveryWithoutFirstService: false,
    })
    expect(
      classifyLandrushZombieEscapeNavigationScaleProofRepairObservation(
        serviceBeforeHold.firstService,
        false,
        false,
        true,
      ),
    ).toEqual({
      firstService: false,
      hold: true,
      inlineRecoveryWithoutFirstService: false,
    })
  })

  test('conserves all transition demands independently from the residual repair cohort', () => {
    const counterDelta = {
      attachmentWork: 6_971,
      cachedAnchorLost: 0,
      inlineRecoveryWithoutFirstService: 4,
      intentCanceled: 0,
      intentFirstService: 15,
      intentIssued: 19,
      intentResolved: 19,
      intentResolveSlices: 19,
      routePublishedDemand: 19,
      searchRestarted: 3,
      searchStarted: 17,
      searchUncausedStartViolations: 0,
    }
    expect(9 + 3).toBe(12)
    expect(counterDelta.intentFirstService + counterDelta.inlineRecoveryWithoutFirstService).toBe(
      19,
    )
    expect(
      landrushZombieEscapeNavigationScaleProofTransitionDemandAccountingIsConserved(counterDelta),
    ).toBe(true)
    expect(
      landrushZombieEscapeNavigationScaleProofTransitionDemandAccountingIsConserved({
        ...counterDelta,
        intentResolved: 18,
      }),
    ).toBe(false)
    expect(
      landrushZombieEscapeNavigationScaleProofTransitionDemandAccountingIsConserved({
        ...counterDelta,
        searchStarted: 23,
      }),
    ).toBe(false)
    expect(
      landrushZombieEscapeNavigationScaleProofTransitionDemandAccountingIsConserved({
        ...counterDelta,
        inlineRecoveryWithoutFirstService: 1,
        intentFirstService: 0,
        intentIssued: 1,
        intentResolved: 1,
        intentResolveSlices: 1,
        routePublishedDemand: 1,
        searchRestarted: 0,
        searchStarted: 1,
      }),
    ).toBe(true)
    expect(
      landrushZombieEscapeNavigationScaleProofTransitionDemandAccountingIsConserved({
        ...counterDelta,
        inlineRecoveryWithoutFirstService: 0,
        intentFirstService: 1,
        intentIssued: 1,
        intentResolved: 1,
        intentResolveSlices: 1,
        routePublishedDemand: 1,
        searchRestarted: 2,
        searchStarted: 3,
      }),
    ).toBe(true)
    expect(
      landrushZombieEscapeNavigationScaleProofTransitionDemandAccountingIsConserved({
        ...counterDelta,
        inlineRecoveryWithoutFirstService: 0,
        intentFirstService: 1,
        intentIssued: 1,
        intentResolved: 1,
        intentResolveSlices: 1,
        routePublishedDemand: 1,
        searchRestarted: 0,
        searchStarted: 0,
      }),
    ).toBe(true)
    expect(
      landrushZombieEscapeNavigationScaleProofTransitionDemandAccountingIsConserved({
        ...counterDelta,
        searchUncausedStartViolations: 1,
      }),
    ).toBe(false)
  })

  test('uses the spatial witness route even when graph-node identity differs', () => {
    const world = createLandrushZombieEscapeNavigationScaleProofOpenWorld(
      createLayeredProofWorld({ disconnectedGroundIsland: true, upperDivider: false }),
      PROOF_WORLD_ORIGIN,
    )
    const target = { x: -3, y: 0, z: 0 } as const
    const state = createReadyProofSpawnSimulation(world, target)
    const graph = state.collisionWorld.navigationGraph
    const certified = createLandrushZombieEscapeNavigationScaleProofCertifiedAnchorSet(state)
    const candidate = [...certified.values()].find((entry) => {
      if (entry.node === entry.witnessNode || entry.layerIndex !== 0) return false
      return (
        sampleProofNodeRoute(state, entry.node, false).reachable ||
        sampleProofNodeRoute(state, entry.node, true).reachable
      )
    })
    expect(candidate).toBeDefined()
    const unreachableWitness = [...graph.nodeIds.keys()].find(
      (node) =>
        graph.layerIndices[node] === candidate!.layerIndex &&
        !sampleProofNodeRoute(state, node, false).reachable &&
        !sampleProofNodeRoute(state, node, true).reachable,
    )
    expect(unreachableWitness).toBeDefined()
    const regionIndex = graph.targetRegionIndex
    const containingRegions = strictRegionBucketCandidates(
      regionIndex,
      candidate!.layerIndex,
      candidate!.x,
      candidate!.z,
    ).filter((region) =>
      sparseNavigationTargetRegionContainsPoint(regionIndex, region, candidate!.x, candidate!.z),
    )
    expect(containingRegions.length).toBeGreaterThan(0)
    for (const region of containingRegions) {
      regionIndex.witnessNodes[region] = unreachableWitness!
    }
    expect(
      resolveSparseNavigationStrictRegionWitnessNode(
        regionIndex,
        candidate!.layerIndex,
        candidate!.x,
        candidate!.z,
      ),
    ).toBe(unreachableWitness!)
    const after = createLandrushZombieEscapeNavigationScaleProofCertifiedAnchorSet(state)
    expect(after.has(candidate!.node)).toBe(false)
    expect(
      spawnZombieEscapeZombieAtNavigationElevation(
        state,
        candidate!.x,
        candidate!.z,
        candidate!.elevation,
      ),
    ).toBe(-1)
  })

  test('filters broad fallback anchors and fails closed on uncertified pinned layouts', () => {
    const world = createLandrushZombieEscapeNavigationScaleProofOpenWorld(
      createLayeredProofWorld({ lowerDivider: false, upperDivider: false }),
      PROOF_WORLD_ORIGIN,
    )
    const initialTarget = { x: -3, y: 0, z: 0 } as const
    const roomTarget = { x: -3, y: 0, z: 3 } as const
    const state = createReadyProofSpawnSimulation(world, initialTarget)
    const plan = createDirectProofConnectorPlan(world)
    const certified = createLandrushZombieEscapeNavigationScaleProofCertifiedAnchorSet(state)
    const graph = state.collisionWorld.navigationGraph
    const targetNode = [...graph.nodeIds.keys()].reduce((best, node) => {
      if (graph.layerIndices[node] !== plan.lowerLayerIndex) return best
      if (best < 0) return node
      const distance =
        (graph.x[node]! - initialTarget.x) ** 2 + (graph.z[node]! - initialTarget.z) ** 2
      const bestDistance =
        (graph.x[best]! - initialTarget.x) ** 2 + (graph.z[best]! - initialTarget.z) ** 2
      return distance < bestDistance ? node : best
    }, -1)
    const targetComponent = graph.fallbackComponentIndices[targetNode]
    const broadOnlyCandidates = [...certified.keys()]
      .filter(
        (node) =>
          node !== plan.lowerSourceNode &&
          node !== plan.upperSourceNode &&
          graph.fallbackComponentIndices[node] === targetComponent &&
          (Math.hypot(
            graph.x[node]! - graph.x[plan.lowerSourceNode]!,
            graph.z[node]! - graph.z[plan.lowerSourceNode]!,
          ) < 2.5 ||
            Math.hypot(
              graph.x[node]! - graph.x[plan.upperSourceNode]!,
              graph.z[node]! - graph.z[plan.upperSourceNode]!,
            ) < 2.5 ||
            Math.hypot(graph.x[node]! - initialTarget.x, graph.z[node]! - initialTarget.z) < 1.5),
      )
      .slice(0, 2)
    expect(broadOnlyCandidates).toHaveLength(2)
    const broadOnly = new Map(
      [plan.lowerSourceNode, plan.upperSourceNode, ...broadOnlyCandidates].map((node) => [
        node,
        certified.get(node)!,
      ]),
    )
    const baseline = selectLandrushZombieEscapeNavigationScaleProofAnchorNodes(
      state.collisionWorld,
      plan,
      initialTarget,
      roomTarget,
      3,
      broadOnly,
    )
    expect(baseline.usedBroadFallback).toBe(true)
    const removedCandidate = baseline.nodes[2]!
    const restricted = new Map(broadOnly)
    restricted.delete(removedCandidate)
    const filtered = selectLandrushZombieEscapeNavigationScaleProofAnchorNodes(
      state.collisionWorld,
      plan,
      initialTarget,
      roomTarget,
      3,
      restricted,
    )
    expect(filtered.usedBroadFallback).toBe(true)
    expect(filtered.nodes[2]).not.toBe(removedCandidate)
    expect([...filtered.nodes].every((node) => restricted.has(node))).toBe(true)

    const missingPinnedSource = new Map(broadOnly)
    missingPinnedSource.delete(plan.lowerSourceNode)
    expect(() =>
      selectLandrushZombieEscapeNavigationScaleProofAnchorNodes(
        state.collisionWorld,
        plan,
        initialTarget,
        roomTarget,
        3,
        missingPinnedSource,
      ),
    ).toThrow('pinned lower connector source is not certified')
    expect(() =>
      assertLandrushZombieEscapeNavigationScaleProofAnchorLayoutCertified(
        new Int32Array([removedCandidate]),
        1,
        restricted,
      ),
    ).toThrow(`explicit anchor ${removedCandidate} is not certified at slot 0`)
  })

  test('rejects a graph coordinate whose Float32 pose resolves to another witness', () => {
    const world = createLandrushZombieEscapeNavigationScaleProofOpenWorld(
      createLayeredProofWorld({ upperDivider: false }),
      PROOF_WORLD_ORIGIN,
    )
    const state = createReadyProofSpawnSimulation(world, { x: -3, y: 0, z: 0 })
    const graph = state.collisionWorld.navigationGraph
    const regionIndex = graph.targetRegionIndex
    const certified = createLandrushZombieEscapeNavigationScaleProofCertifiedAnchorSet(state)
    const candidate = [...certified.values()].find((entry) => {
      const storedInSameBucket =
        Math.floor(entry.x / regionIndex.bucketSize) ===
          Math.floor(entry.storedX / regionIndex.bucketSize) &&
        Math.floor(entry.z / regionIndex.bucketSize) ===
          Math.floor(entry.storedZ / regionIndex.bucketSize)
      return (
        storedInSameBucket &&
        Math.max(Math.abs(entry.x - entry.storedX), Math.abs(entry.z - entry.storedZ)) > 2e-7 &&
        strictRegionBucketCandidates(regionIndex, entry.layerIndex, entry.x, entry.z).length >= 2
      )
    })
    expect(candidate).toBeDefined()
    const witnessNodes = [
      ...new Set(
        [...certified.values()]
          .filter((entry) => entry.layerIndex === candidate!.layerIndex)
          .map((entry) => entry.witnessNode),
      ),
    ]
    expect(witnessNodes.length).toBeGreaterThanOrEqual(2)
    const bucketRegions = [
      ...new Set(
        strictRegionBucketCandidates(
          regionIndex,
          candidate!.layerIndex,
          candidate!.x,
          candidate!.z,
        ),
      ),
    ]
    for (let index = 0; index < bucketRegions.length; index += 1) {
      setNarrowProofRegion(regionIndex, bucketRegions[index]!, 1_000 + index * 30, 1_000, 1, 'x')
    }
    const authoredRegion = bucketRegions[0]!
    const storedRegion = bucketRegions[1]!
    const xDifference = Math.abs(candidate!.x - candidate!.storedX)
    const zDifference = Math.abs(candidate!.z - candidate!.storedZ)
    const axis = xDifference >= zDifference ? 'x' : 'z'
    const halfWidth = Math.max(xDifference, zDifference) * 0.25
    setNarrowProofRegion(regionIndex, authoredRegion, candidate!.x, candidate!.z, halfWidth, axis)
    setNarrowProofRegion(
      regionIndex,
      storedRegion,
      candidate!.storedX,
      candidate!.storedZ,
      halfWidth,
      axis,
    )
    regionIndex.witnessNodes[authoredRegion] = witnessNodes[0]!
    regionIndex.witnessNodes[storedRegion] = witnessNodes[1]!
    expect(
      resolveSparseNavigationStrictRegionWitnessNode(
        regionIndex,
        candidate!.layerIndex,
        candidate!.x,
        candidate!.z,
      ),
    ).toBe(witnessNodes[0]!)
    expect(
      resolveSparseNavigationStrictRegionWitnessNode(
        regionIndex,
        candidate!.layerIndex,
        candidate!.storedX,
        candidate!.storedZ,
      ),
    ).toBe(witnessNodes[1]!)
    expect(
      createLandrushZombieEscapeNavigationScaleProofCertifiedAnchorSet(state).has(candidate!.node),
    ).toBe(false)
  })

  test('replays the breached-room lifecycle and bounds repairs for 14 and 100 agents', async () => {
    const world = createLayeredProofWorld({ upperDivider: false })
    const result = await runLandrushZombieEscapeNavigationScaleProof({
      arena: createZombieEscapeArena(0x51ca_1e5),
      collisionWorld: world,
      collisionWorldGeneration: 7,
      collisionWorldSignature: proofSignature(world),
      fixedDeltaSeconds: ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
      timeoutMs: 120_000,
      worldOrigin: { x: -24, y: 0, z: -17.5 },
    })
    const [small, scale] = result.populations
    const zeroCounterDelta = {
      attachmentWork: 0,
      cachedAnchorLost: 0,
      inlineRecoveryWithoutFirstService: 0,
      intentCanceled: 0,
      intentFirstService: 0,
      intentIssued: 0,
      intentResolved: 0,
      intentResolveSlices: 0,
      routePublishedDemand: 0,
      searchRestarted: 0,
      searchStarted: 0,
      searchUncausedStartViolations: 0,
    }

    expect(result.schemaVersion).toBe(7)
    expect(result.trace.recordedBreachBlockerIds).toEqual([
      'door_house_kitchen_back',
      'item_g_kitchen_run',
    ])
    expect(result.navigationOnlyLimitation).toContain('bounded topology-change repair')
    expect(result.navigationOnlyLimitation).toContain('current-generation route movement')
    expect(result.navigationOnlyLimitation).toContain('does not claim crowd collision latency')
    expect(result.navigationOnlyLimitation).toContain('rendering')
    expect(world.agentRadius).toBe(ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS)
    expect(result.world.fingerprintAfter).toEqual(result.world.fingerprintBefore)
    expect(small.population).toBe(14)
    expect(scale.population).toBe(100)
    expect(small.activeAgentCount).toBe(14)
    expect(scale.activeAgentCount).toBe(100)
    expect(small.coldReadyAgentCount).toBe(14)
    expect(scale.coldReadyAgentCount).toBe(100)
    expect(small.sharedFourteenAnchorPrefixHash).toBe(scale.sharedFourteenAnchorPrefixHash)
    expect(small.target.work).toEqual(scale.target.work)
    expect(small.target.maximumStepWork).toEqual(scale.target.maximumStepWork)
    expect(small.target.tickWorkHash).toBe(scale.target.tickWorkHash)
    expect(small.target.publicationHash).toBe(scale.target.publicationHash)
    expect(small.target.explicitRequestCount).toBe(55)
    expect(scale.target.explicitRequestCount).toBe(55)
    expect(small.noAudioEventDelta).toBe(0)
    expect(scale.noAudioEventDelta).toBe(0)
    for (const population of result.populations) {
      expect(population.navigationOnly).toBe(true)
      expect(population.bounds.maximumRepairFirstServiceTicks).toBe(60)
      expect(population.bounds.maximumRepairHoldTicks).toBe(60)
      expect(population.bounds.productionTopologyRepairTickCap).toBe(30)
      expect(population.bounds.topologyTransitionTickCap).toBe(60)
      expect(population.anchorNodeCount).toBe(population.population)
      expect(population.navigationGraphNodeCount).toBe(result.world.nodeCount)
      expect(population.uniqueAnchorNodeCount).toBeGreaterThan(0)
      expect(population.maximumAnchorNodeOccupancy).toBeGreaterThan(0)
      const expectSettledTransition = (
        transition: (typeof population.topologyTransitions)['lower'],
        repairTickCap: number,
      ) => {
        expect(transition.generationAfter).toBeGreaterThan(transition.generationBefore)
        expect(transition.frozen).toMatchObject({
          adoptedAgentCount: population.population,
          committedGeneration: transition.generationAfter,
          invalidAgentCount: 0,
          reacquiringAgentCount: 0,
        })
        expect(
          transition.frozen.publicationAdoptedAgentCount +
            transition.frozen.publicationRepairAgentCount,
        ).toBe(population.population)
        expect(
          transition.frozen.repairFirstServiceObservedCount +
            transition.frozen.repairInlineRecoveryWithoutFirstServiceCount,
        ).toBe(transition.frozen.publicationRepairAgentCount)
        expect(transition.frozen.repairHoldObservedCount).toBe(
          transition.frozen.publicationRepairAgentCount,
        )
        expect(transition.frozen.counterDelta.cachedAnchorLost).toBe(0)
        expect(
          landrushZombieEscapeNavigationScaleProofTransitionDemandAccountingIsConserved(
            transition.frozen.counterDelta,
          ),
        ).toBe(true)
        expect(transition.frozen.maximumAgentServiceSlicesPerTick).toBeLessThanOrEqual(
          ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
        )
        expect(transition.frozen.maximumFirstServiceAgeTicks).toBeLessThanOrEqual(
          Math.ceil(
            population.population /
              ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
          ),
        )
        if (transition.frozen.repairFirstServiceObservedCount === 0) {
          expect(transition.frozen.maximumRepairFirstServiceTicks).toBe(0)
        } else {
          expect(transition.frozen.maximumRepairFirstServiceTicks).toBeGreaterThan(0)
        }
        expect(transition.frozen.maximumRepairFirstServiceTicks).toBeLessThanOrEqual(repairTickCap)
        expect(transition.frozen.maximumRepairHoldTicks).toBeLessThanOrEqual(repairTickCap)
        expect(transition.frozen.maximumSuccessorVisits).toBeLessThanOrEqual(result.world.nodeCount)
        expect(transition.frozen.settleTickCount).toBeGreaterThan(0)
        expect(transition.frozen.settleTickCount).toBeLessThanOrEqual(repairTickCap)
      }
      for (const transition of Object.values(population.topologyTransitions)) {
        expectSettledTransition(transition, population.bounds.productionTopologyRepairTickCap)
      }
      for (const transition of Object.values(population.publicationTransitions)) {
        expectSettledTransition(transition, population.bounds.maximumRepairHoldTicks)
        expect(transition.movement).toMatchObject({
          counterDelta: zeroCounterDelta,
          currentGenerationMovementOnly: true,
          enabledAgentCount: population.population,
          finalAdoptedAgentCount: population.population,
          fixtureParkingAgentCount: population.population,
          fixtureParkingSetupOnly: true,
          lockstepAnchorOccupancy: population.population,
          lockstepSeparationNeighborDelta: 0,
          movementStartCoincidentAgentCount: population.population,
          setupValidationCounterDelta: zeroCounterDelta,
          setupValidationUnchangedAgentCount: population.population,
          tickCount: 1,
        })
        expect(transition.movement.fixtureParkingDistanceMaximum).toBeGreaterThanOrEqual(
          transition.movement.fixtureParkingDistanceMinimum,
        )
        expect(transition.movement.lockstepAnalyticFirstTickDisplacement).toBeLessThan(0.01)
        expect(transition.movement.lockstepFirstTickDisplacement).toBeGreaterThan(0)
        expect(transition.movement.lockstepFirstTickRadialProgress).toBeGreaterThan(0)
        expect(transition.movement.maximumInitialWaypointDistance).toBeGreaterThan(0)
        expect(transition.movement.maximumAdoptionTick).toBeLessThanOrEqual(
          population.bounds.maximumRepairHoldTicks,
        )
        expect(transition.movement.fixtureParkingPoseHash).toMatch(/^[0-9a-f]{16}$/)
        expect(transition.movement.lockstepPoseHash).toMatch(/^[0-9a-f]{16}$/)
      }
      expect(population.reverseFieldAfter.leaseInvariantViolationCount).toBe(0)
      expect(population.reverseFieldAfter.readerLeaseCount).toBe(0)
      expect(population.reverseFieldAfter.publicationBlockedCount).toBe(0)
      expect(population.reverseFieldAfter.allocatedBytes).toBe(
        population.reverseFieldBefore.allocatedBytes,
      )
      expect(population.publicationTransitions.lower.frozen).toMatchObject({
        counterDelta: zeroCounterDelta,
        maximumFirstServiceAgeTicks: expect.any(Number),
        maximumRepairFirstServiceTicks: 0,
        maximumRepairHoldTicks: 0,
        publicationAdoptedAgentCount: population.population,
        publicationRepairAgentCount: 0,
        repairFirstServiceObservedCount: 0,
        repairHoldObservedCount: 0,
        repairInlineRecoveryWithoutFirstServiceCount: 0,
        settleTickCount: 1,
      })
      expect(population.topologyTransitions.upper.frozen.directActionCount).toBeGreaterThan(0)
    }
    expect(result.connector.functionalCorrectnessOnly).toBe(true)
    expect(result.connector.planHash).toMatch(/^[0-9a-f]{16}$/)
    expect(result.connector.witnessHash).toMatch(/^[0-9a-f]{16}$/)
    expect(result.connector.workHash).toMatch(/^[0-9a-f]{16}$/)
    expect(result.connector.witnesses).toEqual([
      expect.objectContaining({
        completed: true,
        direction: 'lower-to-upper',
        enteredConnector: true,
        sourceRadialReady: true,
        waypointAdvanced: true,
      }),
      expect.objectContaining({
        completed: true,
        direction: 'upper-to-lower',
        enteredConnector: true,
        sourceRadialReady: true,
        waypointAdvanced: true,
      }),
    ])
    for (const value of Object.values(result.connector.refreshDelta)) {
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
    }
    expect(() => JSON.parse(JSON.stringify(result))).not.toThrow()
  }, 125_000)

  test('fails closed before simulation work on a stale signature or aborted run', async () => {
    const world = createLayeredProofWorld()
    const arena = createZombieEscapeArena(1)
    await expect(
      runLandrushZombieEscapeNavigationScaleProof({
        arena,
        collisionWorld: world,
        collisionWorldGeneration: 1,
        collisionWorldSignature: JSON.stringify(['stale-world']),
        fixedDeltaSeconds: ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
        worldOrigin: { x: -24, y: 0, z: -17.5 },
      }),
    ).rejects.toThrow('world authentication failed')

    const controller = new AbortController()
    controller.abort()
    await expect(
      runLandrushZombieEscapeNavigationScaleProof({
        arena,
        collisionWorld: world,
        collisionWorldGeneration: 1,
        collisionWorldSignature: proofSignature(world),
        fixedDeltaSeconds: ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
        signal: controller.signal,
        worldOrigin: { x: -24, y: 0, z: -17.5 },
      }),
    ).rejects.toThrow('was aborted')
  })
})
