import { describe, expect, test } from 'bun:test'
import {
  constrainZombieEscapeAgentSeparationToRoute,
  createZombieEscapeAgentSeparation,
} from './zombie-escape-agent-spatial-index'
import {
  beginZombieEscapeSparseTargetUpdate,
  createZombieEscapeCollisionHit,
  createZombieEscapeCollisionWorld,
  createZombieEscapeFlowField,
  getZombieEscapeSparseCommittedRouteContentHash,
  getZombieEscapeSparseCommittedRouteGeneration,
  inspectZombieEscapeSparseReverseFieldBanks,
  stepZombieEscapeSparseTargetUpdate,
  zombieEscapeSameLayerNavigationSegmentIsClear,
} from './zombie-escape-collision-world'
import { ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS } from './zombie-escape-config'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import {
  advanceZombieEscapeNavigationProgressWatchdog,
  createZombieEscapeSimulation,
  inspectZombieEscapeCommittedNavigationAction,
  setZombieEscapeCollisionWorld,
  setZombieEscapeExternalPlayerPose,
  setZombieEscapeGamePhase,
  spawnZombieEscapeZombie,
  stepZombieEscapeSimulation,
  writeZombieEscapeDeferredNavigationDirection,
  ZOMBIE_ESCAPE_ZOMBIE_INTENT,
} from './zombie-escape-simulation'
import { createZombieEscapeArena } from './zombie-escape-world'

const AGENT_RADIUS = ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS
const UNBOUNDED_TARGET_BUDGET = {
  maximumCandidateVisits: Number.POSITIVE_INFINITY,
  maximumCollisionPredicates: Number.POSITIVE_INFINITY,
  maximumGraphEdgeVisits: Number.POSITIVE_INFINITY,
  maximumHeapOperations: Number.POSITIVE_INFINITY,
  maximumHierarchyNodeVisits: Number.POSITIVE_INFINITY,
  maximumSupportPredicates: Number.POSITIVE_INFINITY,
}
const SURFACE = [
  { x: -6, z: -6 },
  { x: 6, z: -6 },
  { x: 6, z: 6 },
  { x: -6, z: 6 },
]

function publishZombieEscapeSparseTarget(
  state: ReturnType<typeof createZombieEscapeSimulation>,
  input: ReturnType<typeof createZombieEscapeControlState>,
  arena: ReturnType<typeof createZombieEscapeArena>,
) {
  for (
    let tick = 0;
    tick < 1_024 &&
    (!state.navigationGoalInitialized ||
      state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
      state.navigationTargetCommittedRouteGeneration === 0);
    tick += 1
  ) {
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
  }
  expect(state.navigationTargetCommittedRouteGeneration).toBeGreaterThan(0)
}

describe('Zombie Escape real-time navigation', () => {
  test('accepts only exact supported same-layer live-goal segments', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      navigationSupports: [
        { boundary: true, elevation: 0, id: 'ground', polygon: SURFACE },
        { boundary: true, elevation: 3, id: 'upper', polygon: SURFACE },
      ],
      playRadius: 7,
      segments: [
        {
          endX: 0,
          endZ: 1,
          halfThickness: 0.1,
          id: 'wall',
          startX: 0,
          startZ: -1,
        },
      ],
    })
    const hit = createZombieEscapeCollisionHit()

    expect(
      zombieEscapeSameLayerNavigationSegmentIsClear(world, -3, 0, 3, 3, 0, 3, AGENT_RADIUS, hit),
    ).toBe(true)
    expect(
      zombieEscapeSameLayerNavigationSegmentIsClear(world, -3, 0, 0, 3, 0, 0, AGENT_RADIUS, hit),
    ).toBe(false)
    expect(
      zombieEscapeSameLayerNavigationSegmentIsClear(world, -3, 0, 3, -3, 3, 3, AGENT_RADIUS, hit),
    ).toBe(false)

    const disjointWorld = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          elevation: 0,
          id: 'left',
          polygon: [
            { x: -5, z: -2 },
            { x: -1, z: -2 },
            { x: -1, z: 2 },
            { x: -5, z: 2 },
          ],
        },
        {
          elevation: 0,
          id: 'right',
          polygon: [
            { x: 1, z: -2 },
            { x: 5, z: -2 },
            { x: 5, z: 2 },
            { x: 1, z: 2 },
          ],
        },
      ],
      playRadius: 6,
    })
    expect(
      zombieEscapeSameLayerNavigationSegmentIsClear(
        disjointWorld,
        -3,
        0,
        0,
        3,
        0,
        0,
        AGENT_RADIUS,
        hit,
      ),
    ).toBe(false)
  })

  test('keeps an open multi-cell route terminal but republishes across a wall or floor', () => {
    const arena = createZombieEscapeArena(81_021)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 81_022)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      cellSize: 4,
      navigationSupports: [
        { boundary: true, elevation: 0, id: 'ground', polygon: SURFACE },
        { boundary: true, elevation: 3, id: 'upper', polygon: SURFACE },
      ],
      playRadius: 7,
      segments: [
        {
          endX: 2,
          endZ: 4,
          halfThickness: 0.1,
          id: 'topology-wall',
          startX: 2,
          startZ: -4,
        },
      ],
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 1.2
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()

    for (
      let tick = 0;
      tick < 1_024 &&
      (state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
        state.navigationTargetCommittedRouteGeneration === 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.navigationField.graphSparseTargetUpdate.status).toBe('ready')
    const initialRevision = state.navigationTargetRequestedRevision

    state.player.x = -0.3
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.navigationTargetRequestedRevision).toBe(initialRevision)
    state.player.x = 1.2
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.navigationTargetRequestedRevision).toBe(initialRevision)

    state.player.x = 2.8
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(Math.floor(1.2 / world.cellSize)).toBe(Math.floor(2.8 / world.cellSize))
    expect(state.navigationTargetRequestedRevision).toBe(initialRevision + 1)

    for (
      let tick = 0;
      tick < 1_024 && state.navigationField.graphSparseTargetUpdate.status !== 'ready';
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    const wallRevision = state.navigationTargetRequestedRevision
    state.player.y = 3
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.navigationTargetRequestedRevision).toBe(wallRevision + 1)
  })

  test('preserves a forced queued target and cancels an obsolete build on return to committed', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      navigationSupports: [{ boundary: true, elevation: 0, id: 'surface', polygon: SURFACE }],
      playRadius: 7,
    })
    const field = createZombieEscapeFlowField(world)

    expect(beginZombieEscapeSparseTargetUpdate(field, -3, -3, 0, true)).toBe('pending')
    while (field.graphSparseTargetUpdate.status === 'pending') {
      stepZombieEscapeSparseTargetUpdate(field, UNBOUNDED_TARGET_BUDGET)
    }
    expect(field.graphSparseTargetUpdate.status).toBe('ready')
    const initialGeneration = getZombieEscapeSparseCommittedRouteGeneration(field)

    expect(beginZombieEscapeSparseTargetUpdate(field, 3, -3, 0, true)).toBe('pending')
    expect(beginZombieEscapeSparseTargetUpdate(field, 3, 3, 0, true)).toBe('pending')
    expect(field.graphSparseTargetUpdate.requestedForceRebuild).toBe(true)
    expect(beginZombieEscapeSparseTargetUpdate(field, 3, 3, 0)).toBe('pending')
    expect(field.graphSparseTargetUpdate.requestedForceRebuild).toBe(true)
    while (field.graphSparseTargetUpdate.status === 'pending') {
      stepZombieEscapeSparseTargetUpdate(field, UNBOUNDED_TARGET_BUDGET)
    }
    expect(field.graphSparseTargetUpdate).toMatchObject({
      routeTargetX: 3,
      routeTargetZ: 3,
      status: 'ready',
    })
    expect(getZombieEscapeSparseCommittedRouteGeneration(field)).toBe(initialGeneration + 2)

    const committedGeneration = getZombieEscapeSparseCommittedRouteGeneration(field)
    const committedRouteHash = getZombieEscapeSparseCommittedRouteContentHash(field)
    const publicationCount = inspectZombieEscapeSparseReverseFieldBanks(field).publicationCount
    expect(beginZombieEscapeSparseTargetUpdate(field, -3, 3, 0, true)).toBe('pending')
    expect(beginZombieEscapeSparseTargetUpdate(field, 3, 3, 0)).toBe('ready')
    expect(field.graphSparseTargetUpdate.requestedForceRebuild).toBe(false)
    expect(getZombieEscapeSparseCommittedRouteGeneration(field)).toBe(committedGeneration)
    expect(getZombieEscapeSparseCommittedRouteContentHash(field)).toBe(committedRouteHash)
    expect(inspectZombieEscapeSparseReverseFieldBanks(field).publicationCount).toBe(
      publicationCount,
    )

    expect(beginZombieEscapeSparseTargetUpdate(field, -3, 3, 0, true)).toBe('pending')
    while (field.graphSparseTargetUpdate.status === 'pending') {
      stepZombieEscapeSparseTargetUpdate(field, UNBOUNDED_TARGET_BUDGET)
    }
    expect(getZombieEscapeSparseCommittedRouteGeneration(field)).toBe(committedGeneration + 1)
    expect(field.graphSparseTargetUpdate).toMatchObject({ routeTargetX: -3, routeTargetZ: 3 })
    expect(inspectZombieEscapeSparseReverseFieldBanks(field).leaseInvariantViolationCount).toBe(0)
  })

  test('caps separation to a forward cone instead of turning chase sideways', () => {
    const separation = createZombieEscapeAgentSeparation()
    separation.x = -8
    separation.z = 20

    constrainZombieEscapeAgentSeparationToRoute(separation, 1, 0)

    expect(separation.x).toBeCloseTo(0, 8)
    expect(separation.z).toBeCloseTo(0.45, 8)
    expect(separation.x).toBeGreaterThanOrEqual(0)
    expect(Math.atan2(Math.abs(separation.z), 1)).toBeLessThan(Math.PI / 4)

    separation.x = 1
    separation.z = 1
    constrainZombieEscapeAgentSeparationToRoute(separation, 0, 0)
    expect(separation).toEqual({ x: 0, z: 0 })
  })

  test('retries no-progress recovery after a bounded cooldown without per-tick spam', () => {
    const noProgressTicks = new Uint16Array(1)
    const targetNodes = new Int32Array(1).fill(-2)
    const cooldownTicks = new Uint16Array(1)
    const triggers: number[] = []

    for (let tick = 0; tick < 12; tick += 1) {
      if (
        advanceZombieEscapeNavigationProgressWatchdog(
          noProgressTicks,
          targetNodes,
          cooldownTicks,
          0,
          17,
          0,
          0.001,
          3,
          5,
        )
      ) {
        triggers.push(tick)
      }
    }

    expect(triggers).toEqual([3, 8])
    expect(triggers[1]! - triggers[0]!).toBe(5)
    expect(
      advanceZombieEscapeNavigationProgressWatchdog(
        noProgressTicks,
        targetNodes,
        cooldownTicks,
        0,
        17,
        0.01,
        0.001,
        3,
        5,
      ),
    ).toBe(false)
    expect(noProgressTicks[0]).toBe(0)
  })

  test('keeps a cached refresh bearing instead of converting it into a hold', () => {
    const output = { x: 0, z: 0 }

    writeZombieEscapeDeferredNavigationDirection('refresh', AGENT_RADIUS, 0, 0, 3, 4, output)

    expect(output.x).toBeCloseTo(0.6, 8)
    expect(output.z).toBeCloseTo(0.8, 8)
  })

  test('synchronously repairs a connected empty bearing and rejects a disconnected admission', () => {
    const arena = createZombieEscapeArena(81_101)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 81_102)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: AGENT_RADIUS,
        boundaryPolicy: 'none',
        navigationSupports: [{ boundary: true, elevation: 0, id: 'surface', polygon: SURFACE }],
        playRadius: 7,
        segments: [{ endX: 0, endZ: 4, halfThickness: 0.1, id: 'wall', startX: 0, startZ: -4 }],
      }),
    )
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 4
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombie(state, -4, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombie] = 0
    state.zombies.navigationWaypointNode[zombie] = -1
    state.zombies.navigationReachable[zombie] = 0
    state.zombies.navigationDirectionX[zombie] = 0
    state.zombies.navigationDirectionZ[zombie] = 0
    const demandBefore = state.navigationIntentDemandCollisionRecoveryCount

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)

    expect(state.navigationIntentDemandCollisionRecoveryCount).toBe(demandBefore)
    expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe('none')
    expect(state.zombies.intent[zombie]).not.toBe(ZOMBIE_ESCAPE_ZOMBIE_INTENT.blocked)

    const disconnectedArena = createZombieEscapeArena(81_111)
    disconnectedArena.obstacleCount = 0
    const disconnected = createZombieEscapeSimulation(disconnectedArena, 81_112)
    setZombieEscapeCollisionWorld(
      disconnected,
      createZombieEscapeCollisionWorld({
        agentRadius: AGENT_RADIUS,
        boundaryPolicy: 'none',
        navigationSupports: [
          {
            boundary: true,
            elevation: 0,
            id: 'left',
            polygon: [
              { x: -6, z: -3 },
              { x: -1, z: -3 },
              { x: -1, z: 3 },
              { x: -6, z: 3 },
            ],
          },
          {
            boundary: true,
            elevation: 3,
            id: 'right',
            polygon: [
              { x: 1, z: -3 },
              { x: 6, z: -3 },
              { x: 6, z: 3 },
              { x: 1, z: 3 },
            ],
          },
        ],
        playRadius: 7,
      }),
    )
    expect(disconnected.collisionWorld.navigationMode).toBe('sparse')
    setZombieEscapeExternalPlayerPose(disconnected, true)
    setZombieEscapeGamePhase(disconnected, 'night')
    disconnected.waveSpawnRemaining = 0
    disconnected.waveState = 'escape'
    disconnected.player.x = 4
    disconnected.player.y = 3
    disconnected.player.z = 0
    const disconnectedInput = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(disconnected, disconnectedInput, disconnectedArena)

    expect(spawnZombieEscapeZombie(disconnected, -4, 0)).toBe(-1)
    expect(disconnected.zombies.pool.activeCount).toBe(0)
  })

  test('uses a clear live goal and synchronously anchors it when reconciliation becomes occluded', () => {
    const arena = createZombieEscapeArena(81_201)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 81_202)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      navigationSupports: [{ boundary: true, elevation: 0, id: 'surface', polygon: SURFACE }],
      playRadius: 7,
      segments: [
        {
          endX: 0,
          endZ: 4,
          halfThickness: 0.1,
          id: 'wall',
          startX: 0,
          startZ: -4,
        },
      ],
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 4
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombie(state, -4, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombie] = 0

    for (
      let tick = 0;
      tick < 1_024 &&
      (state.zombies.navigationWaypointNode[zombie]! < 0 ||
        state.navigationIntentPendingCount > 0 ||
        state.navigationIntentAdmissionDeferredPendingCount > 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    const heldWaypoint = state.zombies.navigationWaypointNode[zombie]!
    expect(heldWaypoint).toBeGreaterThanOrEqual(0)

    state.zombies.x[zombie] = 3
    state.zombies.y[zombie] = 0
    state.zombies.z[zombie] = -3
    state.zombies.vx[zombie] = 0
    state.zombies.vz[zombie] = 0
    state.zombies.speedScale[zombie] = 1
    state.player.x = 4.1
    state.player.z = 0.2
    state.zombies.navigationIntentCommittedRouteGeneration[zombie] =
      (state.navigationTargetCommittedRouteGeneration - 1) >>> 0
    const sourceX = state.zombies.x[zombie]!
    const sourceZ = state.zombies.z[zombie]!
    const routePublishedDemandBefore = state.navigationIntentDemandRoutePublishedCount

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)

    const liveGoalX = state.player.x - sourceX
    const liveGoalZ = state.player.z - sourceZ
    const liveGoalLength = Math.hypot(liveGoalX, liveGoalZ)
    const velocityLength = Math.hypot(state.zombies.vx[zombie]!, state.zombies.vz[zombie]!)
    const liveGoalDot =
      (state.zombies.vx[zombie]! * liveGoalX + state.zombies.vz[zombie]! * liveGoalZ) /
      (velocityLength * liveGoalLength)
    expect(liveGoalDot).toBeGreaterThan(0.999)
    expect(heldWaypoint).toBeGreaterThanOrEqual(0)
    expect(state.zombies.navigationWaypointNode[zombie]).toBe(-1)
    expect(state.zombies.navigationSparseFlowSearch[zombie]!.routeCorridorGeneration).toBe(0)
    expect(state.zombies.navigationSparseFlowSearch[zombie]!.cachedOriginalNextNode).toBe(-1)
    expect(state.zombies.navigationIntentPending[zombie]).toBe(0)
    expect(state.navigationIntentDemandRoutePublishedCount).toBe(routePublishedDemandBefore)

    state.zombies.x[zombie] = -3
    state.zombies.z[zombie] = 0
    state.zombies.vx[zombie] = 0
    state.zombies.vz[zombie] = 0
    state.zombies.speedScale[zombie] = 0
    const occludedSourceX = state.zombies.x[zombie]!
    const occludedSourceZ = state.zombies.z[zombie]!
    const routeDemandBeforeOcclusion = state.navigationIntentDemandRoutePublishedCount
    const routeSearchesIssuedBeforeOcclusion = state.navigationIntentIssuedCount
    const routeSearchesResolvedBeforeOcclusion = state.navigationIntentResolvedCount
    const attachmentSearchesBeforeOcclusion = state.navigationField.graphAttachmentFullSearchCount
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)

    expect(state.zombies.navigationIntentPending[zombie]).toBe(0)
    expect(state.zombies.navigationIntentValid[zombie]).toBe(1)
    expect(state.zombies.navigationIntentHasCached[zombie]).toBe(1)
    expect(state.zombies.navigationWaypointNode[zombie]).toBeGreaterThanOrEqual(0)
    expect(state.zombies.navigationIntentCommittedRouteGeneration[zombie]).toBe(
      state.navigationTargetCommittedRouteGeneration,
    )
    expect(state.navigationIntentDemandRoutePublishedCount).toBe(routeDemandBeforeOcclusion)
    expect(state.navigationIntentIssuedCount).toBe(routeSearchesIssuedBeforeOcclusion)
    expect(state.navigationIntentResolvedCount).toBe(routeSearchesResolvedBeforeOcclusion)
    expect(state.navigationField.graphAttachmentFullSearchCount).toBe(
      attachmentSearchesBeforeOcclusion,
    )
    expect(state.zombies.x[zombie]).toBe(occludedSourceX)
    expect(state.zombies.z[zombie]).toBe(occludedSourceZ)
  })

  test('rejects a finite retained waypoint when reconciliation moves it across a wall', () => {
    const arena = createZombieEscapeArena(81_251)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 81_252)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      cellSize: 1,
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'reconciliation-surface',
          polygon: [
            { x: -8, z: -8 },
            { x: 8, z: -8 },
            { x: 8, z: 8 },
            { x: -8, z: 8 },
          ],
        },
      ],
      playRadius: 9,
      segments: [
        {
          endX: 0,
          endZ: 4,
          halfThickness: 0.1,
          id: 'reconciliation-vertical-wall',
          startX: 0,
          startZ: -4,
        },
        {
          endX: 4,
          endZ: 0,
          halfThickness: 0.1,
          id: 'reconciliation-horizontal-wall',
          startX: -4,
          startZ: 0,
        },
      ],
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 3
    state.player.y = 0
    state.player.z = -3
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombie(state, -3, -3)
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombie] = 0

    for (
      let tick = 0;
      tick < 1_024 &&
      (state.zombies.navigationWaypointNode[zombie]! < 0 ||
        state.navigationIntentPendingCount > 0 ||
        state.navigationIntentAdmissionDeferredPendingCount > 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    const heldWaypoint = state.zombies.navigationWaypointNode[zombie]!
    expect(heldWaypoint).toBeGreaterThanOrEqual(0)

    state.zombies.x[zombie] = -3
    state.zombies.y[zombie] = 0
    state.zombies.z[zombie] = 3
    state.zombies.vx[zombie] = 0
    state.zombies.vz[zombie] = 0
    state.player.x = 3
    state.player.z = 3
    expect(
      zombieEscapeSameLayerNavigationSegmentIsClear(
        world,
        state.zombies.x[zombie]!,
        state.zombies.y[zombie]!,
        state.zombies.z[zombie]!,
        world.navigationGraph.x[heldWaypoint]!,
        world.navigationLayers[world.navigationGraph.layerIndices[heldWaypoint]!]!.elevation,
        world.navigationGraph.z[heldWaypoint]!,
        AGENT_RADIUS,
      ),
    ).toBe(false)
    const generationBefore = state.navigationTargetCommittedRouteGeneration
    const routeDemandBefore = state.navigationIntentDemandRoutePublishedCount
    const searchesIssuedBefore = state.navigationIntentIssuedCount
    for (
      let tick = 0;
      tick < 1_024 && state.navigationTargetCommittedRouteGeneration === generationBefore;
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.navigationTargetCommittedRouteGeneration).toBeGreaterThan(generationBefore)
    expect(state.navigationIntentDemandRoutePublishedCount).toBe(routeDemandBefore)
    expect(state.zombies.navigationIntentTargetRevision[zombie]).toBe(
      state.navigationTargetRequestedRevision,
    )
    expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe('none')
    for (
      let tick = 0;
      tick < 1_024 &&
      (state.zombies.navigationIntentCommittedRouteGeneration[zombie] !==
        state.navigationTargetCommittedRouteGeneration ||
        state.zombies.navigationIntentPending[zombie] !== 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.navigationIntentIssuedCount).toBe(searchesIssuedBefore)
    expect(state.zombies.navigationIntentCommittedRouteGeneration[zombie]).toBe(
      state.navigationTargetCommittedRouteGeneration,
    )
    expect(state.zombies.navigationIntentPending[zombie]).toBe(0)
    expect(state.zombies.x[zombie]).toBe(-3)
    expect(state.zombies.z[zombie]).toBe(3)
  })

  test('retains a collision-certified wall-end route while a side-switch publication is pending', () => {
    const arena = createZombieEscapeArena(81_301)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 81_302)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      cellSize: 2,
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'side-switch-surface',
          polygon: [
            { x: -8, z: -8 },
            { x: 8, z: -8 },
            { x: 8, z: 8 },
            { x: -8, z: 8 },
          ],
        },
      ],
      playRadius: 9,
      segments: [
        {
          endX: 0,
          endZ: 4,
          halfThickness: 0.1,
          id: 'side-switch-wall',
          startX: 0,
          startZ: -4,
        },
      ],
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 4
    state.player.y = 0
    state.player.z = -5
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombie(state, -4, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombie] = 0

    for (
      let tick = 0;
      tick < 2_048 &&
      (state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
        state.zombies.navigationWaypointNode[zombie]! < 0 ||
        state.navigationIntentPendingCount > 0 ||
        state.navigationIntentAdmissionDeferredPendingCount > 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.zombies.navigationWaypointNode[zombie]).toBeGreaterThanOrEqual(0)
    const generationBefore = state.navigationTargetCommittedRouteGeneration
    const revisionBefore = state.navigationTargetRequestedRevision

    state.player.z = 5
    state.zombies.speedScale[zombie] = 1
    let firstPublicationTick = -1
    let pendingAwayMovementTickCount = 0
    let pendingBlockedTickCount = 0
    let pendingMovementTickCount = 0
    let pendingRetainedRouteTickCount = 0
    for (let tick = 0; tick < 120; tick += 1) {
      const previousX = state.zombies.x[zombie]!
      const previousZ = state.zombies.z[zombie]!
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      if (
        firstPublicationTick < 0 &&
        state.navigationTargetCommittedRouteGeneration !== generationBefore
      ) {
        firstPublicationTick = tick
      }
      const velocityX = state.zombies.vx[zombie]!
      const velocityZ = state.zombies.vz[zombie]!
      const velocityPointsAway =
        velocityX * velocityX + velocityZ * velocityZ > 0.000_001 &&
        velocityX * (state.player.x - state.zombies.x[zombie]!) +
          velocityZ * (state.player.z - state.zombies.z[zombie]!) <
          0
      if (
        state.navigationField.graphSparseTargetUpdate.status === 'pending' &&
        state.navigationTargetCommittedRouteGeneration === generationBefore
      ) {
        expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).toBe('route')
        expect(state.zombies.navigationIntentCurrentTargetFallback[zombie]).toBe(0)
        expect(state.zombies.navigationIntentTargetRevision[zombie]).toBe(revisionBefore)
        expect(
          zombieEscapeSameLayerNavigationSegmentIsClear(
            world,
            state.zombies.x[zombie]!,
            state.zombies.y[zombie]!,
            state.zombies.z[zombie]!,
            state.player.x,
            state.player.y,
            state.player.z,
            AGENT_RADIUS,
          ),
        ).toBe(false)
        pendingRetainedRouteTickCount += 1
        if (
          Math.hypot(state.zombies.x[zombie]! - previousX, state.zombies.z[zombie]! - previousZ) >
          0.000_1
        ) {
          pendingMovementTickCount += 1
        }
        if (velocityPointsAway) pendingAwayMovementTickCount += 1
        if (state.zombies.intent[zombie] === ZOMBIE_ESCAPE_ZOMBIE_INTENT.blocked) {
          pendingBlockedTickCount += 1
        }
      }
    }

    expect(state.navigationTargetRequestedRevision).toBeGreaterThan(revisionBefore)
    expect(pendingRetainedRouteTickCount).toBeGreaterThan(0)
    expect(pendingMovementTickCount).toBeGreaterThan(0)
    expect(pendingAwayMovementTickCount).toBeGreaterThan(0)
    expect(pendingBlockedTickCount).toBe(0)
    expect(firstPublicationTick).toBeGreaterThanOrEqual(0)
    expect(firstPublicationTick).toBeLessThan(14)
  })
})
