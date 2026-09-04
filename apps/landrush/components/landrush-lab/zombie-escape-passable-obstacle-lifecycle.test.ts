import { describe, expect, test } from 'bun:test'
import {
  beginZombieEscapeSparseFlowSearch,
  createZombieEscapeCollisionWorld,
  inspectZombieEscapeSparseAttachmentHeapLeases,
  ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND,
} from '@landrush/zombie-gameplay/zombie-escape-collision-world'
import {
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from '@landrush/zombie-gameplay/zombie-escape-config'
import { createZombieEscapeControlState } from '@landrush/zombie-gameplay/zombie-escape-controls'
import {
  applyZombieEscapeObstacleDelta,
  applyZombieEscapePassableObstacleDelta,
  createZombieEscapeSimulation,
  inspectZombieEscapeCommittedNavigationAction,
  resetZombieEscapeSimulation,
  setZombieEscapeCollisionWorld,
  setZombieEscapeExternalPlayerPose,
  setZombieEscapeGamePhase,
  spawnZombieEscapeZombie,
  stepZombieEscapeSimulation,
  synchronizeZombieEscapePassableObstacleIds,
  type ZombieEscapeSimulation,
} from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { createZombieEscapeArena } from '@landrush/zombie-gameplay/zombie-escape-world'

const DOOR_OBJECT_ID = 'door-a'

function createDoorWorld(broadphaseCellSize: number, includeSecondaryWall = false) {
  return createZombieEscapeCollisionWorld({
    agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
    boundaryPolicy: 'none',
    broadphaseCellSize,
    navigationSupports: [
      {
        boundary: true,
        elevation: 0,
        id: 'ground',
        polygon: [
          { x: -8, z: -8 },
          { x: 8, z: -8 },
          { x: 8, z: 8 },
          { x: -8, z: 8 },
        ],
      },
    ],
    objectSemantics: [
      {
        objectId: DOOR_OBJECT_ID,
        semanticKind: ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door,
      },
    ],
    playRadius: 9,
    segments: [
      {
        breakable: true,
        endX: 0,
        endZ: 2,
        halfThickness: 0.12,
        id: `${DOOR_OBJECT_ID}:panel`,
        maximumY: 2.4,
        minimumY: 0,
        navigationLayerY: 0,
        objectId: DOOR_OBJECT_ID,
        startX: 0,
        startZ: -2,
      },
      ...(includeSecondaryWall
        ? [
            {
              endX: 2,
              endZ: 3,
              halfThickness: 0.12,
              id: 'secondary-wall',
              maximumY: 2.4,
              minimumY: 0,
              navigationLayerY: 0,
              startX: 2,
              startZ: -3,
            },
          ]
        : []),
    ],
  })
}

function publishSparseTarget(state: ZombieEscapeSimulation) {
  const arena = createZombieEscapeArena(71_001)
  arena.obstacleCount = 0
  const input = createZombieEscapeControlState()
  for (
    let tick = 0;
    tick < 512 &&
    (!state.navigationGoalInitialized ||
      state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
      state.navigationTargetCommittedRouteGeneration === 0);
    tick += 1
  ) {
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
  }
  expect(state.navigationTargetCommittedRouteGeneration).toBeGreaterThan(0)
  return { arena, input }
}

function createIntegratedDoorState(includeSecondaryWall = false) {
  const arena = createZombieEscapeArena(71_001)
  arena.obstacleCount = 0
  const state = createZombieEscapeSimulation(arena, 71_002)
  const navigation = createDoorWorld(2, includeSecondaryWall)
  const combat = createDoorWorld(2, includeSecondaryWall)
  setZombieEscapeCollisionWorld(state, navigation, combat)
  setZombieEscapeExternalPlayerPose(state, true)
  setZombieEscapeGamePhase(state, 'night')
  state.waveSpawnRemaining = 0
  state.waveState = 'escape'
  state.player.x = 5
  state.player.y = 0
  state.player.z = 0
  return { arena, combat, navigation, state }
}

function objectOrdinal(state: ZombieEscapeSimulation, objectId = DOOR_OBJECT_ID) {
  const ordinal = state.collisionWorld.objectCatalog.objectIds.indexOf(objectId)
  expect(ordinal).toBeGreaterThanOrEqual(0)
  return ordinal
}

describe('Zombie Escape passable obstacle lifecycle', () => {
  test('opens navigation and combat masks atomically without replacing live topology or zombies', () => {
    const { state } = createIntegratedDoorState()
    const { arena, input } = publishSparseTarget(state)
    const zombieSlot = spawnZombieEscapeZombie(state, -5, 0)
    expect(zombieSlot).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombieSlot] = 0
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)

    const ordinal = objectOrdinal(state)
    expect(state.collisionWorld.objectCatalog.objectSupportsMaskRemoval[ordinal]).toBe(1)
    const collisionWorld = state.collisionWorld
    const combatCollisionWorld = state.combatCollisionWorld
    const graph = state.collisionWorld.navigationGraph
    const layers = state.collisionWorld.navigationLayers
    const strictDistances = state.navigationField.graphStrictDistances
    const strictNextNodes = state.navigationField.graphStrictNextNodes
    const collisionWorldGeneration = state.collisionWorldGeneration
    const navigationTargetGeneration = state.navigationTargetCommittedRouteGeneration
    const publishedReverseFieldBanks = state.navigationField.graphReverseFieldBanks.banks.filter(
      (bank) => bank.generation > 0,
    )
    expect(publishedReverseFieldBanks.length).toBeGreaterThan(0)
    expect(
      publishedReverseFieldBanks.every((bank) => bank.worldRevision === collisionWorld.revision),
    ).toBe(true)
    const zombieGeneration = state.zombies.pool.generation[zombieSlot]
    const zombiePosition = [
      state.zombies.x[zombieSlot],
      state.zombies.y[zombieSlot],
      state.zombies.z[zombieSlot],
    ]
    const committedAction = inspectZombieEscapeCommittedNavigationAction(state, zombieSlot)
    expect(committedAction).not.toBe('none')

    expect({
      ...applyZombieEscapePassableObstacleDelta(state, DOOR_OBJECT_ID),
    }).toEqual({
      applied: true,
      appliedRevision: 1,
      objectId: DOOR_OBJECT_ID,
      requestedRevision: 1,
    })
    expect(state.passableObstacleIds).toEqual(new Set([DOOR_OBJECT_ID]))
    expect(state.destroyedObstacleIds).toEqual(new Set())
    expect(state.collisionWorld.activeObjectMask[ordinal]).toBe(0)
    expect(state.combatCollisionWorld.activeObjectMask[ordinal]).toBe(0)
    expect(state.collisionWorld).toBe(collisionWorld)
    expect(state.combatCollisionWorld).toBe(combatCollisionWorld)
    expect(
      publishedReverseFieldBanks.every(
        (bank) => bank.worldRevision === state.collisionWorld.revision,
      ),
    ).toBe(true)
    expect(state.collisionWorld.navigationGraph).toBe(graph)
    expect(state.collisionWorld.navigationLayers).toBe(layers)
    expect(state.navigationField.graphStrictDistances).toBe(strictDistances)
    expect(state.navigationField.graphStrictNextNodes).toBe(strictNextNodes)
    expect(state.collisionWorldGeneration).toBe(collisionWorldGeneration)
    expect(state.navigationTargetCommittedRouteGeneration).toBe(navigationTargetGeneration)
    expect(state.zombies.pool.active[zombieSlot]).toBe(1)
    expect(state.zombies.pool.generation[zombieSlot]).toBe(zombieGeneration)
    expect([
      state.zombies.x[zombieSlot],
      state.zombies.y[zombieSlot],
      state.zombies.z[zombieSlot],
    ]).toEqual(zombiePosition)
    expect(inspectZombieEscapeCommittedNavigationAction(state, zombieSlot)).toBe(committedAction)
    expect(state.obstacleRevision).toBe(0)
    expect(state.obstacleDeltaMetrics.objectMaskWrites.total).toBe(2)
    expect(state.obstacleDeltaMetrics.requiresRecompileCount).toBe(0)
    expect(state.obstacleDeltaMetrics.worldCompileCount.total).toBe(0)

    const navigationWorldRevision = state.navigationWorldRevision
    expect(
      synchronizeZombieEscapePassableObstacleIds(state, [DOOR_OBJECT_ID], [DOOR_OBJECT_ID]),
    ).toBe(0)
    expect(state.navigationWorldRevision).toBe(navigationWorldRevision)
    expect(state.obstacleDeltaMetrics.objectMaskWrites.total).toBe(2)
    expect(state.obstacleDeltaMetrics.requiresRecompileCount).toBe(0)
    expect(state.obstacleDeltaMetrics.worldCompileCount.total).toBe(0)

    const replacementNavigation = createDoorWorld(3)
    const replacementCombat = createDoorWorld(3)
    expect(setZombieEscapeCollisionWorld(state, replacementNavigation, replacementCombat)).toBe(
      true,
    )
    const replacementOrdinal = objectOrdinal(state)
    expect(state.collisionSourceWorld).toBe(replacementNavigation)
    expect(state.combatCollisionSourceWorld).toBe(replacementCombat)
    expect(replacementNavigation.activeObjectMask[replacementOrdinal]).toBe(1)
    expect(replacementCombat.activeObjectMask[replacementOrdinal]).toBe(1)
    expect(state.collisionWorld.activeObjectMask[replacementOrdinal]).toBe(0)
    expect(state.combatCollisionWorld.activeObjectMask[replacementOrdinal]).toBe(0)
    expect(state.zombies.pool.active[zombieSlot]).toBe(1)
    expect(state.zombies.pool.generation[zombieSlot]).toBe(zombieGeneration)

    setZombieEscapeGamePhase(state, 'build')
    expect(state.passableObstacleIds).toEqual(new Set([DOOR_OBJECT_ID]))
    expect(state.collisionWorld.activeObjectMask[replacementOrdinal]).toBe(0)
    expect(state.combatCollisionWorld.activeObjectMask[replacementOrdinal]).toBe(0)
    setZombieEscapeGamePhase(state, 'night')
    expect(state.collisionWorld.activeObjectMask[replacementOrdinal]).toBe(0)
    expect(state.combatCollisionWorld.activeObjectMask[replacementOrdinal]).toBe(0)

    resetZombieEscapeSimulation(state, arena)
    expect(state.passableObstacleIds).toEqual(new Set([DOOR_OBJECT_ID]))
    expect(state.collisionWorld.activeObjectMask[replacementOrdinal]).toBe(0)
    expect(state.combatCollisionWorld.activeObjectMask[replacementOrdinal]).toBe(0)
  })

  test('keeps pending searches bounded and committed while clearing opened-door targets', () => {
    const { state } = createIntegratedDoorState(true)
    const { arena, input } = publishSparseTarget(state)
    const activeSearchCount = inspectZombieEscapeSparseAttachmentHeapLeases(
      state.navigationField,
    ).availableAgentLeases
    const slots = Array.from({ length: activeSearchCount }, () => {
      const slot = spawnZombieEscapeZombie(state, -5, 0)
      expect(slot).toBeGreaterThanOrEqual(0)
      state.zombies.speedScale[slot] = 0
      const search = state.zombies.navigationSparseFlowSearch[slot]!
      expect(
        beginZombieEscapeSparseFlowSearch(
          search,
          state.navigationField,
          state.zombies.x[slot]!,
          state.zombies.z[slot]!,
          state.player.x,
          state.player.z,
          state.zombies.y[slot]!,
        ),
      ).toBe('pending')
      state.zombies.navigationSparseFlowSearchActive[slot] = 1
      state.zombies.navigationSparseFlowSearchStartedForDemand[slot] = 1
      state.zombies.navigationSparseFlowSearchWorldRevision[slot] = state.navigationWorldRevision
      state.zombies.navigationIntentPending[slot] = 1
      state.zombies.navigationIntentPendingSinceTick[slot] = state.navigationIntentTick
      state.zombies.navigationIntentHasReceivedFirstService[slot] = 0
      state.zombies.navigationBlockerBreakable[slot] = 1
      state.zombies.navigationBlockerObjectId[slot] = DOOR_OBJECT_ID
      state.zombies.navigationBlockerObjectOrdinal[slot] = objectOrdinal(state)
      state.zombies.attackTargetObjectId[slot] = DOOR_OBJECT_ID
      state.zombies.attackTargetObjectOrdinal[slot] = objectOrdinal(state)
      state.navigationIntentIssuedCount += 1
      state.navigationIntentDemandRoutePublishedCount += 1
      state.navigationIntentPendingCount += 1
      return slot
    })
    const pendingCount = state.navigationIntentPendingCount
    const issuedCount = state.navigationIntentIssuedCount
    const invalidatedCount = state.navigationSparseSearchInvalidatedCount
    const deferredMarkedCount = state.navigationIntentAdmissionDeferredMarkedCount
    const committedActions = slots.map((slot) =>
      inspectZombieEscapeCommittedNavigationAction(state, slot),
    )
    expect(committedActions.every((action) => action !== 'none')).toBe(true)

    expect(applyZombieEscapePassableObstacleDelta(state, DOOR_OBJECT_ID).applied).toBe(true)
    expect(state.navigationIntentPendingCount).toBe(pendingCount)
    expect(state.navigationIntentIssuedCount).toBe(issuedCount)
    expect(state.navigationSparseSearchInvalidatedCount).toBe(invalidatedCount)
    expect(state.navigationIntentAdmissionDeferredMarkedCount).toBe(deferredMarkedCount)
    expect(slots.every((slot) => state.zombies.navigationSparseFlowSearchActive[slot] !== 0)).toBe(
      true,
    )
    expect(slots.every((slot) => state.zombies.navigationBlockerObjectId[slot] === null)).toBe(true)
    expect(slots.every((slot) => state.zombies.attackTargetObjectId[slot] === null)).toBe(true)
    expect(slots.map((slot) => inspectZombieEscapeCommittedNavigationAction(state, slot))).toEqual(
      committedActions,
    )

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.navigationSparseSearchInvalidatedCount - invalidatedCount).toBe(activeSearchCount)
    expect(state.navigationSparseSearchAgentServiceSliceCountThisTick).toBeLessThanOrEqual(
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
    )
    expect(
      slots.filter((slot) => state.zombies.navigationSparseFlowSearchActive[slot] !== 0),
    ).toHaveLength(0)
    expect(slots.every((slot) => state.zombies.pool.active[slot] !== 0)).toBe(true)
    expect(
      slots.every((slot) => inspectZombieEscapeCommittedNavigationAction(state, slot) !== 'none'),
    ).toBe(true)
    for (let tick = 0; tick < 512 && state.navigationIntentPendingCount > 0; tick += 1) {
      const invalidatedBeforeTick = state.navigationSparseSearchInvalidatedCount
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      expect(
        state.navigationSparseSearchInvalidatedCount - invalidatedBeforeTick,
      ).toBeLessThanOrEqual(ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick)
    }
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.navigationSparseSearchInvalidatedCount - invalidatedCount).toBe(activeSearchCount)
    expect(state.navigationSparseSearchWorldStaleActiveCount).toBe(0)
    expect(state.navigationSparseSearchAgentServiceSliceCountThisTick).toBeLessThanOrEqual(
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
    )
  })

  test('queues pre-install opens and prunes removed object lifetimes before id reuse', () => {
    const arena = createZombieEscapeArena(71_101)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 71_102)

    expect(
      synchronizeZombieEscapePassableObstacleIds(state, [DOOR_OBJECT_ID], [DOOR_OBJECT_ID]),
    ).toBe(0)
    expect(state.passableObstacleIds).toEqual(new Set([DOOR_OBJECT_ID]))

    const installedNavigation = createDoorWorld(2)
    const installedCombat = createDoorWorld(2)
    setZombieEscapeCollisionWorld(state, installedNavigation, installedCombat)
    const installedOrdinal = objectOrdinal(state)
    expect(state.collisionWorld.activeObjectMask[installedOrdinal]).toBe(0)
    expect(state.combatCollisionWorld.activeObjectMask[installedOrdinal]).toBe(0)

    expect(synchronizeZombieEscapePassableObstacleIds(state, [], [])).toBe(1)
    expect(state.passableObstacleIds).toEqual(new Set())
    expect(state.collisionWorld.activeObjectMask[installedOrdinal]).toBe(1)
    expect(state.combatCollisionWorld.activeObjectMask[installedOrdinal]).toBe(1)

    const reusedNavigation = createDoorWorld(3)
    const reusedCombat = createDoorWorld(3)
    setZombieEscapeCollisionWorld(state, reusedNavigation, reusedCombat)
    const reusedOrdinal = objectOrdinal(state)
    expect(state.collisionWorld.activeObjectMask[reusedOrdinal]).toBe(1)
    expect(state.combatCollisionWorld.activeObjectMask[reusedOrdinal]).toBe(1)
  })

  test('restores every collider consistently when a broken semantic door resets', () => {
    const { state } = createIntegratedDoorState()
    const ordinal = objectOrdinal(state)
    expect(state.collisionWorld.objectCatalog.objectSemanticKinds[ordinal]).toBe(
      ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door,
    )
    expect(state.collisionWorld.objectCatalog.objectSupportsMaskRemoval[ordinal]).toBe(1)

    expect(applyZombieEscapeObstacleDelta(state, DOOR_OBJECT_ID).applied).toBe(true)
    expect(state.destroyedObstacleIds).toEqual(new Set([DOOR_OBJECT_ID]))
    expect(state.passableObstacleIds).toEqual(new Set())
    expect(state.obstacleDeltaMetrics.requiresRecompileCount).toBe(0)
    expect(state.obstacleDeltaMetrics.worldCompileCount.total).toBe(0)

    setZombieEscapeGamePhase(state, 'build')
    expect(state.destroyedObstacleIds).toEqual(new Set())
    expect(state.passableObstacleIds).toEqual(new Set())
    expect(state.collisionWorld.activeObjectMask[ordinal]).toBe(1)
    expect(state.combatCollisionWorld.activeObjectMask[ordinal]).toBe(1)
  })
})
