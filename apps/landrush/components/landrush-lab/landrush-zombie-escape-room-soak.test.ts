import { describe, expect, test } from 'bun:test'
import {
  beginLandrushZombieEscapeRoomSoak,
  createLandrushZombieEscapeRoomSoakBridge,
  createLandrushZombieEscapeRoomSoakState,
  createLandrushZombieEscapeRoutingDebugSnapshot,
  endLandrushZombieEscapeRoomSoak,
  type LandrushZombieEscapeRoomSoakPlayerState,
  readLandrushZombieEscapeRoomSoakSnapshot,
  requestLandrushZombieEscapeRoomSoakObstacleDelta,
  requestLandrushZombieEscapeRoomSoakTargetRoster,
} from './landrush-zombie-escape-mode'
import { createZombieEscapeCollisionWorld } from './zombie-escape-collision-world'
import {
  getZombieEscapeZombieCollisionRadiusMeters,
  ZOMBIE_ESCAPE_CAPACITY,
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from './zombie-escape-config'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import {
  createZombieEscapeSimulation,
  inspectZombieEscapeCommittedNavigationAction,
  resetZombieEscapeSimulation,
  setZombieEscapeCollisionWorld,
  setZombieEscapeGamePhase,
  setZombieEscapeObstacleDamageEnabled,
  spawnZombieEscapeZombie,
  stepZombieEscapeSimulation,
  ZOMBIE_ESCAPE_BOSS_KIND,
} from './zombie-escape-simulation'
import { createZombieEscapeArena } from './zombie-escape-world'

describe('Landrush Zombie Escape room-soak policy lifecycle', () => {
  test('captures enabled obstacle damage once and restores it exactly on end after reset', () => {
    const arena = createZombieEscapeArena(91_201)
    const simulation = createZombieEscapeSimulation(arena, 91_202)
    const soakState = createLandrushZombieEscapeRoomSoakState()
    soakState.enabled = true
    setZombieEscapeGamePhase(simulation, 'night')
    simulation.player.health = 37

    expect(beginLandrushZombieEscapeRoomSoak(soakState, simulation)).toEqual({
      active: true,
      activeZombieCount: 0,
      enabled: true,
      obstacleDamageSuppressed: true,
      obstacleDeltaAppliedRevision: 0,
      obstacleDeltaRequestedRevision: 0,
      phaseHeld: true,
      playerProtected: true,
      reachableSpawnCompletedCount: 0,
      representedZombieCount: 0,
      rosterRealized: false,
      scheduledZombieCount: simulation.waveSpawnRemaining,
      targetZombieCount: 0,
      zombieCapacity: 100,
    })
    expect(soakState.originalObstacleDamageEnabled).toBe(true)
    expect(soakState.originalPlayerHealth).toBe(37)
    expect(simulation.obstacleDamageEnabled).toBe(false)
    expect(simulation.player.health).toBeGreaterThan(37)

    beginLandrushZombieEscapeRoomSoak(soakState, simulation)
    expect(soakState.originalObstacleDamageEnabled).toBe(true)
    expect(soakState.originalPlayerHealth).toBe(37)

    resetZombieEscapeSimulation(simulation, arena)
    expect(simulation.obstacleDamageEnabled).toBe(false)

    expect(endLandrushZombieEscapeRoomSoak(soakState, simulation)).toEqual({
      active: false,
      activeZombieCount: 0,
      enabled: true,
      obstacleDamageSuppressed: false,
      obstacleDeltaAppliedRevision: 0,
      obstacleDeltaRequestedRevision: 0,
      phaseHeld: false,
      playerProtected: false,
      reachableSpawnCompletedCount: 0,
      representedZombieCount: 0,
      rosterRealized: false,
      scheduledZombieCount: 0,
      targetZombieCount: 0,
      zombieCapacity: 100,
    })
    expect(simulation.obstacleDamageEnabled).toBe(true)
    expect(simulation.player.health).toBe(37)
    expect(soakState.originalObstacleDamageEnabled).toBeNull()
    expect(soakState.originalPlayerHealth).toBeNull()
  })

  test('restores a pre-suppressed policy as false and reports the actual post-end state', () => {
    const arena = createZombieEscapeArena(91_203)
    const simulation = createZombieEscapeSimulation(arena, 91_204)
    const soakState = createLandrushZombieEscapeRoomSoakState()
    soakState.enabled = true
    setZombieEscapeObstacleDamageEnabled(simulation, false)
    setZombieEscapeGamePhase(simulation, 'night')

    beginLandrushZombieEscapeRoomSoak(soakState, simulation)
    expect(soakState.originalObstacleDamageEnabled).toBe(false)
    expect(endLandrushZombieEscapeRoomSoak(soakState, simulation).obstacleDamageSuppressed).toBe(
      true,
    )
    expect(simulation.obstacleDamageEnabled).toBe(false)
    expect(readLandrushZombieEscapeRoomSoakSnapshot(soakState, simulation)).toMatchObject({
      active: false,
      obstacleDamageSuppressed: true,
      phaseHeld: false,
    })
  })

  test('releases only player protection and re-protects without replacing the original health', () => {
    const arena = createZombieEscapeArena(91_213)
    const simulation = createZombieEscapeSimulation(arena, 91_214)
    const soakState = createLandrushZombieEscapeRoomSoakState()
    soakState.enabled = true
    setZombieEscapeGamePhase(simulation, 'night')
    simulation.player.health = 100
    const bridge = createLandrushZombieEscapeRoomSoakBridge(soakState, simulation)
    const playerState: LandrushZombieEscapeRoomSoakPlayerState = {
      audioWriteSequence: -1,
      health: -1,
      hitSlowSeconds: -1,
      hurtFlash: -1,
      phase: 'build',
      playerProtected: false,
      status: 'playing',
    }

    bridge.begin()
    expect(soakState.originalPlayerHealth).toBe(100)
    expect(bridge.getPlayerState(playerState)).toBe(playerState)
    expect(playerState.audioWriteSequence).toBe(simulation.audioEvents.writeSequence)
    expect(playerState).toMatchObject({
      phase: 'night',
      playerProtected: true,
      status: 'playing',
    })
    expect(playerState.health).toBeGreaterThan(100)

    expect(bridge.releasePlayerProtection()).toMatchObject({
      active: true,
      obstacleDamageSuppressed: true,
      phaseHeld: true,
      playerProtected: false,
    })
    expect(simulation.player.health).toBe(100)
    expect(simulation.obstacleDamageEnabled).toBe(false)

    simulation.player.health = 92
    simulation.player.hitSlowSeconds = ZOMBIE_ESCAPE_SIMULATION.playerHitSlowSeconds
    simulation.player.hurtFlash = 1
    bridge.releasePlayerProtection()
    expect(simulation.player.health).toBe(92)

    expect(bridge.begin()).toMatchObject({
      active: true,
      obstacleDamageSuppressed: true,
      phaseHeld: true,
      playerProtected: true,
    })
    expect(soakState.originalPlayerHealth).toBe(100)
    expect(simulation.player.health).toBeGreaterThan(100)
    expect(bridge.getPlayerState(playerState)).toMatchObject({
      health: simulation.player.health,
      hitSlowSeconds: ZOMBIE_ESCAPE_SIMULATION.playerHitSlowSeconds,
      hurtFlash: 1,
      phase: 'night',
      playerProtected: true,
      status: 'playing',
    })

    bridge.end()
    expect(simulation.player.health).toBe(100)
    expect(simulation.obstacleDamageEnabled).toBe(true)
  })

  test('requests an idempotent full-capacity roster without bypassing sparse spawn validation', () => {
    const arena = createZombieEscapeArena(91_209)
    const simulation = createZombieEscapeSimulation(arena, 91_210)
    const soakState = createLandrushZombieEscapeRoomSoakState()
    soakState.enabled = true
    setZombieEscapeGamePhase(simulation, 'night')
    const initialWaveSpawnRemaining = simulation.waveSpawnRemaining
    const initialWaveSpawnTimerSeconds = simulation.waveSpawnTimerSeconds

    beginLandrushZombieEscapeRoomSoak(soakState, simulation)
    const requested = requestLandrushZombieEscapeRoomSoakTargetRoster(soakState, simulation)

    expect(requested).toMatchObject({
      active: true,
      activeZombieCount: 0,
      enabled: true,
      reachableSpawnCompletedCount: 0,
      representedZombieCount: 0,
      rosterRealized: false,
      scheduledZombieCount: 100,
      targetZombieCount: 100,
      zombieCapacity: 100,
    })
    expect(ZOMBIE_ESCAPE_CAPACITY.zombies).toBe(100)
    expect(simulation.waveSpawnRemaining).toBe(initialWaveSpawnRemaining)
    expect(simulation.replacementSpawnRemaining).toBe(
      ZOMBIE_ESCAPE_CAPACITY.zombies - initialWaveSpawnRemaining,
    )
    expect(simulation.waveSpawnTimerSeconds).toBe(initialWaveSpawnTimerSeconds)
    expect(simulation.zombies.pool.activeCount).toBe(0)
    expect(simulation.navigationSparseSpawnSearchStartedCount).toBe(0)

    expect(requestLandrushZombieEscapeRoomSoakTargetRoster(soakState, simulation)).toEqual(
      requested,
    )
    expect(simulation.replacementSpawnRemaining).toBe(
      ZOMBIE_ESCAPE_CAPACITY.zombies - initialWaveSpawnRemaining,
    )
  })

  test('counts a pending boss once when filling the diagnostic roster', () => {
    const arena = createZombieEscapeArena(91_215)
    const simulation = createZombieEscapeSimulation(arena, 91_216)
    const soakState = createLandrushZombieEscapeRoomSoakState()
    soakState.enabled = true
    setZombieEscapeGamePhase(simulation, 'night')
    simulation.bossSpawnPending[ZOMBIE_ESCAPE_BOSS_KIND.heavy] = 1
    const genericScheduled = simulation.waveSpawnRemaining

    beginLandrushZombieEscapeRoomSoak(soakState, simulation)
    const requested = requestLandrushZombieEscapeRoomSoakTargetRoster(soakState, simulation)

    expect(requested.scheduledZombieCount).toBe(ZOMBIE_ESCAPE_CAPACITY.zombies)
    expect(simulation.replacementSpawnRemaining).toBe(
      ZOMBIE_ESCAPE_CAPACITY.zombies - genericScheduled - 1,
    )
    expect(requestLandrushZombieEscapeRoomSoakTargetRoster(soakState, simulation)).toEqual(
      requested,
    )
  })

  test('admits exactly 100 grounded non-overlapping zombies with zero initial attachment searches', () => {
    const createExactRoster = () => {
      const arena = createZombieEscapeArena(91_211)
      arena.obstacleCount = 0
      const simulation = createZombieEscapeSimulation(arena, 91_212)
      const world = createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        boundaryPolicy: 'none',
        navigationSupports: [
          {
            boundary: true,
            elevation: 0,
            id: 'ground',
            polygon: [
              { x: -30, z: -30 },
              { x: 30, z: -30 },
              { x: 30, z: 30 },
              { x: -30, z: 30 },
            ],
          },
        ],
        playRadius: 32,
      })
      setZombieEscapeCollisionWorld(simulation, world)
      setZombieEscapeGamePhase(simulation, 'night')
      simulation.player.x = 0
      simulation.player.z = 0
      simulation.player.health = Number.MAX_SAFE_INTEGER
      simulation.wave = 8
      simulation.waveState = 'active'
      simulation.waveSpawnRemaining = 100
      simulation.replacementSpawnRemaining = 0
      simulation.waveSpawnTimerSeconds = 0
      const input = createZombieEscapeControlState()
      let tick = 0
      while (tick < 5_000 && simulation.zombies.pool.activeCount < 100) {
        stepZombieEscapeSimulation(
          simulation,
          input,
          ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
          arena,
        )
        simulation.zombies.speedScale.fill(0)
        tick += 1
      }
      expect(tick).toBeLessThan(5_000)
      return simulation
    }

    const simulation = createExactRoster()
    expect(simulation.zombies.pool.activeCount).toBe(100)
    expect(simulation.navigationSparseSpawnSearchCompletedCount).toBe(100)
    expect(simulation.navigationSparseSpawnSearchActive).toBe(false)
    expect(simulation.navigationSparseSpawnProbeMaximumObservedPerAdmission).toBeLessThanOrEqual(64)
    expect(simulation.navigationSparseSearchSpawnServiceSliceCountTotal).toBe(0)
    expect(simulation.navigationSparseSearchSpawnProgressSliceCountTotal).toBe(0)
    expect(simulation.navigationField.graphAttachmentFullSearchCount).toBe(0)
    expect(simulation.navigationIntentDemandSpawnCount).toBe(0)
    expect(simulation.navigationIntentPendingCount).toBe(0)
    expect(simulation.navigationIntentAdmissionDeferredPendingCount).toBe(0)
    for (let first = 0; first < 100; first += 1) {
      expect(simulation.zombies.y[first]).toBe(0)
      expect(simulation.zombies.navigationIntentHasCached[first]).toBe(1)
      expect(simulation.zombies.navigationIntentValid[first]).toBe(1)
      expect(simulation.zombies.navigationIntentPending[first]).toBe(0)
      const committedAction = inspectZombieEscapeCommittedNavigationAction(simulation, first)
      expect(committedAction).not.toBe('none')
      if (simulation.zombies.navigationWaypointNode[first]! < 0) {
        expect(committedAction).toBe('direct')
      }
      expect(simulation.zombies.navigationIntentCommittedRouteGeneration[first]).toBe(
        simulation.navigationTargetCommittedRouteGeneration,
      )
      expect(
        Math.hypot(simulation.zombies.x[first]!, simulation.zombies.z[first]!),
      ).toBeGreaterThanOrEqual(8)
      for (let second = first + 1; second < 100; second += 1) {
        const clearance =
          getZombieEscapeZombieCollisionRadiusMeters(simulation.zombies.variant[first]!) +
          getZombieEscapeZombieCollisionRadiusMeters(simulation.zombies.variant[second]!) +
          0.009
        expect(
          Math.hypot(
            simulation.zombies.x[first]! - simulation.zombies.x[second]!,
            simulation.zombies.z[first]! - simulation.zombies.z[second]!,
          ),
        ).toBeGreaterThanOrEqual(clearance)
      }
    }

    const replay = createExactRoster()
    expect([...replay.zombies.x]).toEqual([...simulation.zombies.x])
    expect([...replay.zombies.y]).toEqual([...simulation.zombies.y])
    expect([...replay.zombies.z]).toEqual([...simulation.zombies.z])
    expect(replay.navigationSparseSpawnProbeCountTotal).toBe(
      simulation.navigationSparseSpawnProbeCountTotal,
    )
  })

  test('requests one deterministic active obstacle through the production mask transaction', () => {
    const arena = createZombieEscapeArena(91_207)
    arena.obstacleCount = 0
    const simulation = createZombieEscapeSimulation(arena, 91_208)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      boxes: [
        {
          breakable: true,
          centerX: -2,
          centerZ: 0,
          halfDepth: 0.5,
          halfWidth: 0.5,
          id: 'zeta:footprint',
          objectId: 'zeta',
          rotation: 0,
        },
        {
          breakable: true,
          centerX: 2,
          centerZ: 0,
          halfDepth: 0.5,
          halfWidth: 0.5,
          id: 'alpha:footprint',
          objectId: 'alpha',
          rotation: 0,
        },
      ],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -8, z: -8 },
            { x: 8, z: -8 },
            { x: 8, z: 8 },
            { x: -8, z: 8 },
          ],
        },
      ],
      playRadius: 9,
    })
    setZombieEscapeCollisionWorld(simulation, world)
    setZombieEscapeGamePhase(simulation, 'night')

    const result = requestLandrushZombieEscapeRoomSoakObstacleDelta(simulation)

    expect({ ...result }).toEqual({
      applied: true,
      appliedRevision: 1,
      objectId: 'alpha',
      requestedRevision: 1,
    })
    expect(
      readLandrushZombieEscapeRoomSoakSnapshot(
        createLandrushZombieEscapeRoomSoakState(),
        simulation,
      ),
    ).toMatchObject({
      obstacleDeltaAppliedRevision: 1,
      obstacleDeltaRequestedRevision: 1,
    })
    expect(createLandrushZombieEscapeRoutingDebugSnapshot(simulation)).toMatchObject({
      obstacleDeltaAllocationCountTotal: 0,
      obstacleDeltaAppliedCount: 1,
      obstacleDeltaAppliedRevision: 1,
      obstacleDeltaFullArrayClearCountTotal: 0,
      obstacleDeltaObjectMaskWritesTotal: 2,
      obstacleDeltaRequestCount: 1,
      obstacleDeltaRequestedRevision: 1,
      obstacleDeltaRevisionAdvanceCount: 1,
      obstacleDeltaUnchangedCount: 0,
      obstacleDeltaViewRevisionAdvanceCount: 2,
      obstacleDeltaWorldCompileCountTotal: 0,
    })
  })

  test('publishes the fixed navigation budget and exact simulation counters', () => {
    const arena = createZombieEscapeArena(91_205)
    arena.obstacleCount = 0
    const simulation = createZombieEscapeSimulation(arena, 91_206)
    setZombieEscapeGamePhase(simulation, 'night')
    simulation.waveSpawnRemaining = 0
    simulation.waveState = 'escape'
    for (let slot = 0; slot < 3; slot += 1) {
      spawnZombieEscapeZombie(simulation, -4 + slot * 4, 6)
    }

    stepZombieEscapeSimulation(
      simulation,
      createZombieEscapeControlState(),
      ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
      arena,
    )
    simulation.navigationSparseSpawnSearchDependencyWaiting = true
    simulation.navigationSparseCachedFollowWork.heapOperationsMaximumObservedPerTick = 2
    simulation.navigationSparseCachedFollowWork.heapOperationsThisTick = 1
    simulation.navigationSparseCachedFollowWork.heapOperationsTotal = 11
    simulation.navigationSparseCollisionReanchorAttemptCount = 5
    simulation.navigationSparseCollisionReanchorCompletedCount = 3
    simulation.navigationSparseCollisionReanchorFailedCount = 2
    simulation.navigationSparseFlowSearchWork.heapOperationsMaximumObservedPerTick = 4
    simulation.navigationSparseFlowSearchWork.heapOperationsThisTick = 3
    simulation.navigationSparseFlowSearchWork.heapOperationsTotal = 13
    simulation.navigationSparseSpawnWork.attachmentHierarchyNodeVisitsMaximumObservedPerTick = 10
    simulation.navigationSparseSpawnWork.attachmentHierarchyNodeVisitsThisTick = 9
    simulation.navigationSparseSpawnWork.attachmentHierarchyNodeVisitsTotal = 19
    simulation.navigationSparseSpawnWork.heapOperationsMaximumObservedPerTick = 6
    simulation.navigationSparseSpawnWork.heapOperationsThisTick = 5
    simulation.navigationSparseSpawnWork.heapOperationsTotal = 15
    simulation.navigationSparseTargetWork.heapOperationsMaximumObservedPerTick = 8
    simulation.navigationSparseTargetWork.heapOperationsThisTick = 7
    simulation.navigationSparseTargetWork.heapOperationsTotal = 17
    simulation.navigationSparseSearchHeapOperationsMaximumObservedPerTick = 16
    simulation.navigationSparseSearchHeapOperationsThisTick = 16
    simulation.navigationSparseSearchHeapOperationsTotal = 56

    expect(createLandrushZombieEscapeRoutingDebugSnapshot(simulation)).toMatchObject({
      graphAttachmentCandidateCount: simulation.navigationField.graphAttachmentCandidateCount,
      graphAttachmentFullSearchCount: simulation.navigationField.graphAttachmentFullSearchCount,
      graphAttachmentSupportCheckCount: simulation.navigationField.graphAttachmentSupportCheckCount,
      maximumResolveCountObservedPerTick: 3,
      navigationRefreshSlotCapacity: simulation.zombies.pool.capacity,
      navigationSparseAttachmentActiveAgentLeaseCount: 0,
      navigationSparseAttachmentAvailableAgentLeaseCount: 8,
      navigationSparseAttachmentFieldSingletonLeaseReserved: true,
      navigationSparseAttachmentLeaseInvariantViolationCount: 0,
      navigationSparseAttachmentMaximumActiveAgentLeaseCountObserved: 0,
      navigationSparseAttachmentMaximumHierarchyNodeCount: 0,
      navigationSparseAttachmentSpawnLeaseReserved: true,
      navigationSparseCachedFollowHeapOperationsMaximumObservedPerTick: 2,
      navigationSparseCachedFollowHeapOperationsThisTick: 1,
      navigationSparseCachedFollowHeapOperationsTotal: 11,
      navigationSparseCollisionReanchorAttemptCount: 5,
      navigationSparseCollisionReanchorCompletedCount: 3,
      navigationSparseCollisionReanchorFailedCount: 2,
      navigationSparseFlowSearchHeapOperationsMaximumObservedPerTick: 4,
      navigationSparseFlowSearchHeapOperationsThisTick: 3,
      navigationSparseFlowSearchHeapOperationsTotal: 13,
      navigationSparseSearchHeapOperationsMaximumObservedPerTick: 16,
      navigationSparseSearchHeapOperationsThisTick: 16,
      navigationSparseSearchHeapOperationsTotal: 56,
      navigationSparseSearchMaximumHeapOperationsPerAgentSlice: 32,
      navigationSparseSearchMaximumHeapOperationsPerTick: 256,
      navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsMaximumObservedPerTick: 10,
      navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsThisTick: 9,
      navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsTotal: 19,
      navigationSparseSpawnSearchHeapOperationsMaximumObservedPerTick: 6,
      navigationSparseSpawnSearchHeapOperationsThisTick: 5,
      navigationSparseSpawnSearchHeapOperationsTotal: 15,
      navigationSparseSpawnSearchDependencyWaiting: true,
      navigationSparseSearchWorldStaleActiveCount:
        simulation.navigationSparseSearchWorldStaleActiveCount,
      navigationSparseTargetUpdateHeapOperationsMaximumObservedPerTick: 8,
      navigationSparseTargetUpdateHeapOperationsThisTick: 7,
      navigationSparseTargetUpdateHeapOperationsTotal: 17,
      resolveBudgetPerTick: ZOMBIE_ESCAPE_SIMULATION.navigationIntentResolveBudgetPerTick,
      resolveCount: 3,
      resolveCountThisTick: 3,
    })
  })
})
