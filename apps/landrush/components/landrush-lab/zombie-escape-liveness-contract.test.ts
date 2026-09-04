import { describe, expect, test } from 'bun:test'
import { createZombieEscapeCollisionWorld } from '@landrush/zombie-gameplay/zombie-escape-collision-world'
import {
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from '@landrush/zombie-gameplay/zombie-escape-config'
import { createZombieEscapeControlState } from '@landrush/zombie-gameplay/zombie-escape-controls'
import {
  createZombieEscapeSimulation,
  inspectZombieEscapeCommittedNavigationAction,
  setZombieEscapeCollisionWorld,
  setZombieEscapeExternalPlayerPose,
  setZombieEscapeGamePhase,
  spawnZombieEscapeZombie,
  stepZombieEscapeSimulation,
  writeZombieEscapeDeferredNavigationDirection,
  ZOMBIE_ESCAPE_ZOMBIE_INTENT,
  type ZombieEscapeSimulation,
} from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { resolveSparseNavigationStrictRegionIndex } from '@landrush/zombie-gameplay/zombie-escape-sparse-navigation'
import {
  createZombieEscapeArena,
  type ZombieEscapeArenaData,
} from '@landrush/zombie-gameplay/zombie-escape-world'

const FIXED_DELTA_SECONDS = ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds
const MAXIMUM_STATIONARY_PURSUIT_TICKS = 30
const POSITION_PROGRESS_EPSILON_METERS = 0.000_1

function configurePursuitState(
  arena: ZombieEscapeArenaData,
  simulationSeed: number,
  zombieCapacity: number,
) {
  arena.obstacleCount = 0
  const state = createZombieEscapeSimulation(arena, simulationSeed, undefined, {
    zombieCapacity,
  })
  setZombieEscapeExternalPlayerPose(state, true)
  setZombieEscapeGamePhase(state, 'night')
  state.waveSpawnRemaining = 0
  state.waveState = 'escape'
  state.player.health = 1_000_000
  return state
}

function installConnectedWallWorld(state: ZombieEscapeSimulation) {
  const wallEndZ = 6
  const world = createZombieEscapeCollisionWorld({
    agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
    boundaryPolicy: 'none',
    navigationSupports: [
      {
        boundary: true,
        elevation: 0,
        id: 'connected-pursuit-surface',
        polygon: [
          { x: -25, z: -18 },
          { x: 25, z: -18 },
          { x: 25, z: 18 },
          { x: -25, z: 18 },
        ],
      },
    ],
    playRadius: 30,
    segments: [
      {
        endX: 0,
        endZ: wallEndZ,
        halfThickness: 0.1,
        id: 'connected-pursuit-wall',
        startX: 0,
        startZ: -wallEndZ,
      },
    ],
  })
  setZombieEscapeCollisionWorld(state, world)
  return { wallEndZ, world }
}

describe('Zombie Escape user-visible navigation liveness', () => {
  test('keeps a legal connected-route waypoint live while its replacement is refreshing', () => {
    const arena = createZombieEscapeArena(95_000)
    const state = configurePursuitState(arena, 95_001, 1)
    const { world } = installConnectedWallWorld(state)
    const direction = { x: 0, z: 0 }
    const source = { x: -5, z: 0 }
    const cachedWallEndWaypoint = { x: -1, z: 7 }

    writeZombieEscapeDeferredNavigationDirection(
      'refresh',
      world.agentRadius,
      source.x,
      source.z,
      cachedWallEndWaypoint.x,
      cachedWallEndWaypoint.z,
      direction,
    )

    const expectedLength = Math.hypot(
      cachedWallEndWaypoint.x - source.x,
      cachedWallEndWaypoint.z - source.z,
    )
    expect(direction.x).toBeCloseTo((cachedWallEndWaypoint.x - source.x) / expectedLength, 8)
    expect(direction.z).toBeCloseTo((cachedWallEndWaypoint.z - source.z) / expectedLength, 8)
  })

  test('after route admission, never leaves a connected same-layer pursuer stationary or yaw-only beyond half a second', () => {
    const arena = createZombieEscapeArena(95_010)
    const state = configurePursuitState(arena, 95_011, 100)
    const { wallEndZ, world } = installConnectedWallWorld(state)
    state.player.x = 15
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    for (
      let tick = 0;
      tick < 512 &&
      (!state.navigationGoalInitialized ||
        state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
        state.navigationTargetCommittedRouteGeneration === 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }
    expect(state.navigationTargetCommittedRouteGeneration).toBeGreaterThan(0)
    const zombies = Array.from({ length: 100 }, (_, index) =>
      spawnZombieEscapeZombie(state, -0.5 - (index % 10) * 0.8, -8 + Math.floor(index / 10) * 1.7),
    )
    for (
      let tick = 0;
      tick < 512 &&
      (state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
        state.navigationIntentAdmissionDeferredPendingCount > 0 ||
        state.navigationIntentPendingCount > 0 ||
        zombies.some((slot) => state.zombies.navigationIntentValid[slot] === 0));
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }
    expect(zombies.every((slot) => state.zombies.navigationIntentValid[slot] !== 0)).toBe(true)
    expect(zombies.every((slot) => state.zombies.navigationIntentHasCached[slot] !== 0)).toBe(true)
    expect(
      zombies.every(
        (slot) =>
          state.zombies.navigationIntentCommittedRouteGeneration[slot] ===
          state.navigationTargetCommittedRouteGeneration,
      ),
    ).toBe(true)
    expect(state.navigationIntentAdmissionDeferredPendingCount).toBe(0)
    expect(state.navigationIntentPendingCount).toBe(0)
    const previousX = Float64Array.from(zombies, (slot) => state.zombies.x[slot]!)
    const previousZ = Float64Array.from(zombies, (slot) => state.zombies.z[slot]!)
    const previousHeading = Float64Array.from(zombies, (slot) => state.zombies.heading[slot]!)
    const stationaryTicks = new Uint16Array(zombies.length)
    const maximumStationaryTicks = new Uint16Array(zombies.length)
    let yawOnlyTickCount = 0
    let wallCrossingViolationCount = 0

    for (let tick = 0; tick < 1_200; tick += 1) {
      state.player.z = Math.sin(tick * FIXED_DELTA_SECONDS * 0.7) * 2
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)

      for (let index = 0; index < zombies.length; index += 1) {
        const slot = zombies[index]!
        const x = state.zombies.x[slot]!
        const z = state.zombies.z[slot]!
        const displacement = Math.hypot(x - previousX[index]!, z - previousZ[index]!)
        const playerDistance = Math.hypot(state.player.x - x, state.player.z - z)
        const pursuitIntent = state.zombies.intent[slot] === ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase
        const outsideAttackHold =
          playerDistance > ZOMBIE_ESCAPE_SIMULATION.zombiePlayerAttackReachMeters + 0.25

        expect(inspectZombieEscapeCommittedNavigationAction(state, slot)).not.toBe('none')
        expect(state.zombies.intent[slot]).not.toBe(ZOMBIE_ESCAPE_ZOMBIE_INTENT.blocked)

        if (pursuitIntent && outsideAttackHold && displacement < POSITION_PROGRESS_EPSILON_METERS) {
          stationaryTicks[index] += 1
          maximumStationaryTicks[index] = Math.max(
            maximumStationaryTicks[index]!,
            stationaryTicks[index]!,
          )
          if (Math.abs(state.zombies.heading[slot]! - previousHeading[index]!) > 0.000_001) {
            yawOnlyTickCount += 1
          }
        } else {
          stationaryTicks[index] = 0
        }

        if (previousX[index]! < 0 && x >= 0 && Math.abs(z) < wallEndZ + world.agentRadius) {
          wallCrossingViolationCount += 1
        }
        previousX[index] = x
        previousZ[index] = z
        previousHeading[index] = state.zombies.heading[slot]!
      }
    }

    expect(Math.max(...maximumStationaryTicks)).toBeLessThanOrEqual(
      MAXIMUM_STATIONARY_PURSUIT_TICKS,
    )
    expect(yawOnlyTickCount).toBe(0)
    expect(zombies.every((slot) => state.zombies.x[slot]! > 0)).toBe(true)
    expect(wallCrossingViolationCount).toBe(0)
    expect(state.navigationSparseSearchBudgetViolationCount).toBe(0)
  })

  test('validates one hundred admitted sources without per-agent graph-search fan-out', () => {
    const arena = createZombieEscapeArena(95_015)
    const state = configurePursuitState(arena, 95_016, 100)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        boundaryPolicy: 'none',
        navigationSupports: [
          {
            boundary: true,
            elevation: 0,
            id: 'source-validation-surface',
            polygon: [
              { x: -24, z: -18 },
              { x: 24, z: -18 },
              { x: 24, z: 18 },
              { x: -24, z: 18 },
            ],
          },
        ],
        playRadius: 26,
      }),
    )
    state.player.x = 18
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    for (
      let tick = 0;
      tick < 256 &&
      (!state.navigationGoalInitialized ||
        state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
        state.navigationTargetCommittedRouteGeneration <= 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }
    const zombies = Array.from({ length: 100 }, (_, index) =>
      spawnZombieEscapeZombie(state, -18 + (index % 10) * 1.4, -7 + Math.floor(index / 10) * 1.5),
    )
    expect(zombies.every((slot) => slot >= 0)).toBe(true)
    for (const zombie of zombies) {
      state.zombies.x[zombie] = state.zombies.x[zombie]! + 0.05
      state.zombies.speedScale[zombie] = 0
    }
    const searchesBeforeValidation = state.navigationSparseSearchStartedCount
    const fullSearchesBeforeValidation = state.navigationField.graphAttachmentFullSearchCount

    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)

    expect(state.zombies.pool.activeCount).toBe(100)
    expect(
      zombies.every(
        (zombie) => inspectZombieEscapeCommittedNavigationAction(state, zombie) !== 'none',
      ),
    ).toBe(true)
    expect(state.navigationSparseSearchStartedCount).toBe(searchesBeforeValidation)
    expect(state.navigationField.graphAttachmentFullSearchCount).toBe(fullSearchesBeforeValidation)
  })

  test('rejects sparse admission before the committed target bank is ready', () => {
    const arena = createZombieEscapeArena(95_019)
    const state = configurePursuitState(arena, 95_018, 1)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        boundaryPolicy: 'none',
        navigationSupports: [
          {
            boundary: true,
            elevation: 0,
            id: 'unresolved-left-surface',
            polygon: [
              { x: -4, z: -4 },
              { x: -0.5, z: -4 },
              { x: -0.5, z: 4 },
              { x: -4, z: 4 },
            ],
          },
          {
            boundary: true,
            elevation: 3,
            id: 'unresolved-right-surface',
            polygon: [
              { x: 0.5, z: -4 },
              { x: 4, z: -4 },
              { x: 4, z: 4 },
              { x: 0.5, z: 4 },
            ],
          },
        ],
        playRadius: 5,
      }),
    )
    state.player.x = 1
    state.player.y = 3
    state.player.z = 0
    const slot = spawnZombieEscapeZombie(state, -1, 0)

    expect(slot).toBe(-1)
    expect(state.zombies.pool.activeCount).toBe(0)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.navigationIntentAdmissionDeferredPendingCount).toBe(0)
  })

  test('rejects a disconnected spawn instead of admitting a living zombie without a path', () => {
    const arena = createZombieEscapeArena(95_020)
    const state = configurePursuitState(arena, 95_021, 1)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'sealed-left-surface',
          polygon: [
            { x: -4, z: -4 },
            { x: -0.5, z: -4 },
            { x: -0.5, z: 4 },
            { x: -4, z: 4 },
          ],
        },
        {
          boundary: true,
          elevation: 3,
          id: 'sealed-right-surface',
          polygon: [
            { x: 0.5, z: -4 },
            { x: 4, z: -4 },
            { x: 4, z: 4 },
            { x: 0.5, z: 4 },
          ],
        },
      ],
      playRadius: 5,
    })
    expect(world.navigationMode).toBe('sparse')
    setZombieEscapeCollisionWorld(state, world)
    state.player.health = 100
    state.player.x = 1
    state.player.y = 3
    state.player.z = 0
    const input = createZombieEscapeControlState()
    for (
      let tick = 0;
      tick < 256 &&
      (!state.navigationGoalInitialized ||
        state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
        state.navigationField.targetLayerIndex < 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }
    expect(state.navigationField.graphSparseTargetUpdate.status).toBe('ready')
    expect(spawnZombieEscapeZombie(state, -2, 0)).toBe(-1)
    expect(state.zombies.pool.activeCount).toBe(0)
    expect(state.player.health).toBe(100)
    expect(state.obstacleHitCounts.size).toBe(0)
    expect(state.destroyedObstacleIds.size).toBe(0)
  })

  test('retires a retained route once the current target publication proves it disconnected', () => {
    const arena = createZombieEscapeArena(95_030)
    const state = configurePursuitState(arena, 95_031, 1)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        boundaryPolicy: 'none',
        navigationSupports: [
          {
            boundary: true,
            elevation: 0,
            id: 'overlapping-ground',
            polygon: [
              { x: -5, z: -4 },
              { x: 5, z: -4 },
              { x: 5, z: 4 },
              { x: -5, z: 4 },
            ],
          },
          {
            boundary: true,
            elevation: 3,
            id: 'overlapping-upper',
            polygon: [
              { x: -5, z: -4 },
              { x: 5, z: -4 },
              { x: 5, z: 4 },
              { x: -5, z: 4 },
            ],
          },
        ],
        playRadius: 6,
      }),
    )
    state.player.x = 3
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    for (
      let tick = 0;
      tick < 256 &&
      (!state.navigationGoalInitialized ||
        state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
        state.navigationTargetCommittedRouteGeneration <= 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }
    const groundRouteGeneration = state.navigationTargetCommittedRouteGeneration
    const zombie = spawnZombieEscapeZombie(state, -3, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)
    expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe('none')
    state.zombies.speedScale[zombie] = 0
    state.waveState = 'active'
    state.waveSpawnRemaining = 0
    state.waveSpawnTimerSeconds = 10_000
    state.player.y = 3
    const searchesBeforeTargetMove = state.navigationSparseSearchStartedCount
    const issuedBeforeTargetMove = state.navigationIntentIssuedCount

    for (let tick = 0; tick < 512 && state.zombies.pool.active[zombie] !== 0; tick += 1) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
      if (state.zombies.pool.active[zombie] !== 0) {
        expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe('none')
      }
    }

    expect(state.navigationTargetCommittedRouteGeneration).toBeGreaterThan(groundRouteGeneration)
    expect(state.zombies.pool.active[zombie]).toBe(0)
    expect(state.zombies.pool.activeCount).toBe(0)
    expect(state.replacementSpawnRemaining).toBe(1)
    expect(state.navigationIntentIssuedCount - issuedBeforeTargetMove).toBeLessThanOrEqual(2)
    expect(state.navigationSparseSearchStartedCount - searchesBeforeTargetMove).toBeLessThanOrEqual(
      2,
    )
    const searchesAfterRetirement = state.navigationSparseSearchStartedCount
    for (let tick = 0; tick < 120; tick += 1) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }
    expect(state.navigationSparseSearchStartedCount).toBe(searchesAfterRetirement)
    expect(state.replacementSpawnRemaining).toBe(1)
  })

  test('atomically retires active sparse routes when a topology swap invalidates their bank', () => {
    const arena = createZombieEscapeArena(95_040)
    const state = configurePursuitState(arena, 95_041, 1)
    const createWallWorld = (wallHalfLength: number) =>
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        boundaryPolicy: 'none',
        navigationSupports: [
          {
            boundary: true,
            elevation: 0,
            id: 'topology-swap-ground',
            polygon: [
              { x: -6, z: -5 },
              { x: 6, z: -5 },
              { x: 6, z: 5 },
              { x: -6, z: 5 },
            ],
          },
        ],
        playRadius: 7,
        segments: [
          {
            endX: 0,
            endZ: wallHalfLength,
            halfThickness: 0.1,
            id: 'topology-swap-wall',
            startX: 0,
            startZ: -wallHalfLength,
          },
        ],
      })
    setZombieEscapeCollisionWorld(state, createWallWorld(4))
    state.player.x = 3
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    for (
      let tick = 0;
      tick < 256 &&
      (!state.navigationGoalInitialized ||
        state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
        state.navigationTargetCommittedRouteGeneration <= 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }
    const zombie = spawnZombieEscapeZombie(state, -3, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)
    expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe('none')
    state.waveState = 'active'
    state.waveSpawnRemaining = 0
    state.waveSpawnTimerSeconds = 10_000

    setZombieEscapeCollisionWorld(state, createWallWorld(2))

    expect(state.zombies.pool.active[zombie]).toBe(0)
    expect(state.zombies.pool.activeCount).toBe(0)
    expect(state.replacementSpawnRemaining).toBe(1)
    expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).toBe('none')
    for (let tick = 0; tick < 120; tick += 1) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
      expect(state.zombies.pool.activeCount).toBe(0)
    }
    expect(state.replacementSpawnRemaining).toBe(1)
  })

  test('reverses a connector traversal toward the endpoint serving the current target', () => {
    const arena = createZombieEscapeArena(95_045)
    const state = configurePursuitState(arena, 95_046, 1)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        boundaryPolicy: 'none',
        navigationConnectors: [
          {
            ascendingEnd: true,
            chainId: 'malformed',
            chainLowerY: 0,
            chainOrder: 0,
            chainUpperY: 3,
            endX: 8,
            endY: 3,
            endZ: 0,
            halfWidth: 0.8,
            id: 'malformed:0',
            startX: 0,
            startY: 0,
            startZ: 0,
          },
        ],
        navigationSupports: [
          {
            boundary: true,
            elevation: 0,
            id: 'malformed-ground',
            polygon: [
              { x: -4, z: -4 },
              { x: 4, z: -4 },
              { x: 4, z: 4 },
              { x: -4, z: 4 },
            ],
          },
          {
            boundary: true,
            elevation: 3,
            id: 'malformed-upper',
            polygon: [
              { x: -4, z: -4 },
              { x: 4, z: -4 },
              { x: 4, z: 4 },
              { x: -4, z: 4 },
            ],
          },
        ],
        playRadius: 12,
      }),
    )
    state.player.x = -2
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    for (
      let tick = 0;
      tick < 256 &&
      (!state.navigationGoalInitialized ||
        state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
        state.navigationTargetCommittedRouteGeneration <= 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }
    const zombie = spawnZombieEscapeZombie(state, 0, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.x[zombie] = 7.95
    state.zombies.y[zombie] = 2.98
    state.zombies.z[zombie] = 0
    state.zombies.navigationConnector[zombie] = 0
    state.zombies.navigationConnectorTargetEnd[zombie] = 1
    state.zombies.speedScale[zombie] = 1
    state.waveState = 'active'
    state.waveSpawnRemaining = 0
    state.waveSpawnTimerSeconds = 10_000
    const searchesBeforeExit = state.navigationSparseSearchStartedCount
    const startDistanceBefore = Math.hypot(
      state.zombies.x[zombie]! - state.collisionWorld.navigationConnectors[0]!.startX,
      state.zombies.z[zombie]! - state.collisionWorld.navigationConnectors[0]!.startZ,
    )

    for (let tick = 0; tick < 30; tick += 1) {
      expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe('none')
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
      expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe('none')
    }

    expect(state.zombies.pool.active[zombie]).toBe(1)
    expect(state.zombies.pool.activeCount).toBe(1)
    expect(state.replacementSpawnRemaining).toBe(0)
    expect(
      Math.hypot(
        state.zombies.x[zombie]! - state.collisionWorld.navigationConnectors[0]!.startX,
        state.zombies.z[zombie]! - state.collisionWorld.navigationConnectors[0]!.startZ,
      ),
    ).toBeLessThan(startDistanceBefore)
    expect(state.navigationLivingWithoutCommittedActionCount).toBe(0)
    expect(state.navigationSparseSearchStartedCount).toBe(searchesBeforeExit)
  })

  test('retires a same-generation route after reconciliation moves its owner off-component', () => {
    const arena = createZombieEscapeArena(95_050)
    const state = configurePursuitState(arena, 95_051, 1)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        boundaryPolicy: 'none',
        navigationSupports: [
          {
            boundary: true,
            elevation: 0,
            id: 'reconciliation-left',
            polygon: [
              { x: -6, z: -4 },
              { x: -1, z: -4 },
              { x: -1, z: 4 },
              { x: -6, z: 4 },
            ],
          },
          {
            boundary: true,
            elevation: 0,
            id: 'reconciliation-right',
            polygon: [
              { x: 1, z: -4 },
              { x: 6, z: -4 },
              { x: 6, z: 4 },
              { x: 1, z: 4 },
            ],
          },
        ],
        playRadius: 7,
      }),
    )
    state.player.x = -4
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    for (
      let tick = 0;
      tick < 256 &&
      (!state.navigationGoalInitialized ||
        state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
        state.navigationTargetCommittedRouteGeneration <= 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }
    const zombie = spawnZombieEscapeZombie(state, -3, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)
    const routeGeneration = state.zombies.navigationIntentCommittedRouteGeneration[zombie]
    expect(routeGeneration).toBe(state.navigationTargetCommittedRouteGeneration)
    state.zombies.x[zombie] = 4
    state.zombies.z[zombie] = 0
    state.zombies.speedScale[zombie] = 0
    state.waveState = 'active'
    state.waveSpawnRemaining = 0
    state.waveSpawnTimerSeconds = 10_000
    const searchesBeforeReconciliation = state.navigationSparseSearchStartedCount

    for (let tick = 0; tick < 512 && state.zombies.pool.active[zombie] !== 0; tick += 1) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
      if (state.zombies.pool.active[zombie] !== 0) {
        expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe('none')
      }
    }

    expect(state.navigationTargetCommittedRouteGeneration).toBe(routeGeneration)
    expect(state.zombies.pool.active[zombie]).toBe(0)
    expect(state.replacementSpawnRemaining).toBe(1)
    expect(state.navigationSparseSearchStartedCount - searchesBeforeReconciliation).toBe(0)
    const searchesAfterRetirement = state.navigationSparseSearchStartedCount
    for (let tick = 0; tick < 120; tick += 1) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }
    expect(state.navigationSparseSearchStartedCount).toBe(searchesAfterRetirement)
  })

  test('projects an unsupported live player pose onto current free space instead of retaining an old goal', () => {
    const arena = createZombieEscapeArena(95_060)
    const state = configurePursuitState(arena, 95_061, 1)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        boundaryPolicy: 'none',
        boxes: [
          {
            breakable: false,
            centerX: 0,
            centerZ: 0,
            halfDepth: 0.8,
            halfWidth: 0.8,
            id: 'unsupported-target-obstacle',
            maximumY: 2,
            minimumY: 0,
            objectId: 'unsupported-target-obstacle',
            rotation: 0,
          },
        ],
        navigationSupports: [
          {
            boundary: true,
            elevation: 0,
            id: 'projected-target-ground',
            polygon: [
              { x: -8, z: -6 },
              { x: 8, z: -6 },
              { x: 8, z: 6 },
              { x: -8, z: 6 },
            ],
          },
        ],
        playRadius: 10,
      }),
    )
    state.player.x = 5
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    for (
      let tick = 0;
      tick < 256 &&
      (!state.navigationGoalInitialized ||
        state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
        state.navigationTargetCommittedRouteGeneration <= 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }
    const previousGoalX = state.navigationGoalX
    const zombie = spawnZombieEscapeZombie(state, -5, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombie] = 0

    state.player.x = 0
    state.player.z = 0
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)

    expect(state.navigationGoalInitialized).toBe(true)
    expect(state.navigationGoalResolvedTick).toBe(state.navigationIntentTick)
    expect(state.navigationGoalX).not.toBe(previousGoalX)
    expect(Math.hypot(state.navigationGoalX, state.navigationGoalZ)).toBeLessThanOrEqual(3)
    expect(
      resolveSparseNavigationStrictRegionIndex(
        state.collisionWorld.navigationGraph.targetRegionIndex,
        state.navigationGoalLayerIndex,
        state.navigationGoalX,
        state.navigationGoalZ,
      ),
    ).toBeGreaterThanOrEqual(0)
    expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe('none')
    expect(state.navigationLivingWithoutCommittedActionCount).toBe(0)
    expect(state.navigationStaleTargetCount).toBe(0)

    for (let tick = 0; tick < 512; tick += 1) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
      if (
        state.navigationField.graphSparseTargetUpdate.status === 'ready' &&
        state.navigationIntentPendingCount === 0
      ) {
        break
      }
    }
    expect(state.zombies.pool.active[zombie]).toBe(1)
    expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe('none')
    expect(state.navigationLivingWithoutCommittedActionCount).toBe(0)
    expect(state.navigationStaleTargetCount).toBe(0)
    expect(state.navigationIntentIssuedCount).toBe(
      state.navigationIntentDemandSpawnCount +
        state.navigationIntentDemandWorldChangedCount +
        state.navigationIntentDemandConnectorChangedCount +
        state.navigationIntentDemandRoutePublishedCount +
        state.navigationIntentDemandCachedAnchorLostCount +
        state.navigationIntentDemandCollisionRecoveryCount,
    )

    state.player.x = 100
    state.player.z = 100
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    expect(state.navigationGoalInitialized).toBe(false)
    expect(state.navigationGoalResolvedTick).toBe(state.navigationIntentTick)
    expect(state.zombies.pool.activeCount).toBe(1)
    expect(state.navigationLivingWithoutCommittedActionCount).toBe(1)
    expect(state.navigationStaleTargetCount).toBe(1)
    expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).toBe('none')
  })

  test('keeps the full cohort routed when the player stands on elevated furniture', () => {
    const arena = createZombieEscapeArena(95_065)
    const state = configurePursuitState(arena, 95_066, 100)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        boundaryPolicy: 'none',
        boxes: [
          {
            breakable: false,
            centerX: 0,
            centerZ: 0,
            halfDepth: 0.8,
            halfWidth: 0.8,
            id: 'elevated-player-furniture',
            maximumY: 1,
            minimumY: 0,
            objectId: 'elevated-player-furniture',
            rotation: 0,
          },
        ],
        navigationSupports: [
          {
            boundary: true,
            elevation: 0,
            id: 'elevated-player-ground',
            polygon: [
              { x: -18, z: -12 },
              { x: 18, z: -12 },
              { x: 18, z: 12 },
              { x: -18, z: 12 },
            ],
          },
          {
            boundary: true,
            elevation: 3,
            id: 'elevated-player-upper',
            polygon: [
              { x: -18, z: -12 },
              { x: 18, z: -12 },
              { x: 18, z: 12 },
              { x: -18, z: 12 },
            ],
          },
        ],
        playRadius: 22,
      }),
    )
    state.player.x = 12
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    for (
      let tick = 0;
      tick < 512 &&
      (!state.navigationGoalInitialized ||
        state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
        state.navigationTargetCommittedRouteGeneration <= 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }
    const zombies = Array.from({ length: 100 }, (_, index) =>
      spawnZombieEscapeZombie(state, -15 + (index % 10) * 1.35, -7 + Math.floor(index / 10) * 1.5),
    )
    expect(zombies.every((slot) => slot >= 0)).toBe(true)

    state.player.x = 0
    state.player.y = 1
    state.player.z = 0
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)

    expect(state.navigationGoalInitialized).toBe(true)
    expect(state.navigationGoalLayerIndex).toBe(0)
    expect(state.navigationGoalY).toBe(0)
    expect(state.navigationGoalResolvedTick).toBe(state.navigationIntentTick)
    expect(state.zombies.pool.activeCount).toBe(100)
    expect(state.navigationLivingWithoutCommittedActionCount).toBe(0)
    expect(state.navigationStaleTargetCount).toBe(0)
    expect(
      zombies.every(
        (zombie) =>
          state.zombies.pool.active[zombie] !== 0 &&
          state.zombies.navigationIntentTargetRevision[zombie] ===
            state.navigationTargetRequestedRevision &&
          inspectZombieEscapeCommittedNavigationAction(state, zombie) !== 'none',
      ),
    ).toBe(true)

    for (
      let tick = 0;
      tick < 512 &&
      (state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
        state.navigationIntentPendingCount > 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }
    expect(state.zombies.pool.activeCount).toBe(100)
    expect(state.navigationLivingWithoutCommittedActionCount).toBe(0)
    expect(state.navigationStaleTargetCount).toBe(0)
  })

  test('resolves exact floors and connector transitions without cross-floor projection', () => {
    const arena = createZombieEscapeArena(95_067)
    const state = configurePursuitState(arena, 95_068, 1)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        boundaryPolicy: 'none',
        navigationConnectors: [
          {
            ascendingEnd: true,
            chainId: 'floor-transition',
            chainLowerY: 0,
            chainOrder: 0,
            chainUpperY: 3,
            endX: 2,
            endY: 3,
            endZ: 0,
            halfWidth: 0.8,
            id: 'floor-transition:0',
            startX: -2,
            startY: 0,
            startZ: 0,
          },
        ],
        navigationSupports: [
          {
            boundary: true,
            elevation: 0,
            id: 'floor-transition-ground',
            polygon: [
              { x: -6, z: -4 },
              { x: 6, z: -4 },
              { x: 6, z: 4 },
              { x: -6, z: 4 },
            ],
          },
          {
            boundary: true,
            elevation: 3,
            id: 'floor-transition-upper',
            polygon: [
              { x: -6, z: -4 },
              { x: 6, z: -4 },
              { x: 6, z: 4 },
              { x: -6, z: 4 },
            ],
          },
        ],
        playRadius: 8,
      }),
    )
    const input = createZombieEscapeControlState()

    state.player.x = 0
    state.player.y = 3
    state.player.z = 2
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    expect(state.navigationGoalLayerIndex).toBe(1)
    expect(state.navigationGoalY).toBe(3)

    state.player.x = 0
    state.player.y = 1.5
    state.player.z = 0
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    expect(state.navigationGoalLayerIndex).toBe(1)
    expect(state.navigationGoalY).toBe(3)
    expect(state.navigationGoalResolvedTick).toBe(state.navigationIntentTick)
    expect(state.navigationStaleTargetCount).toBe(0)
  })

  test('refuses a dense runtime world when integrated gameplay requires sparse navigation', () => {
    const arena = createZombieEscapeArena(95_070)
    const state = createZombieEscapeSimulation(arena, 95_071, undefined, {
      requireSparseNavigation: true,
      zombieCapacity: 1,
    })
    const denseWorld = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      playRadius: 10,
    })

    expect(state.collisionWorld.navigationMode).toBe('sparse')
    expect(spawnZombieEscapeZombie(state, 0, 0)).toBe(-1)
    expect(denseWorld.navigationMode).toBe('dense')
    expect(() => setZombieEscapeCollisionWorld(state, denseWorld)).toThrow(
      'Zombie Escape integrated gameplay requires authored sparse navigation',
    )
  })
})
