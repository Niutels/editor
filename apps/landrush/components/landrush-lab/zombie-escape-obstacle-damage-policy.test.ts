import { describe, expect, test } from 'bun:test'
import {
  visitZombieEscapeAudioEventsAfter,
  ZOMBIE_ESCAPE_AUDIO_EVENT_KIND,
  type ZombieEscapeAudioEventKind,
} from './zombie-escape-audio-events'
import {
  createZombieEscapeCollisionWorld,
  findFirstActiveZombieEscapeBreakableObjectId,
} from './zombie-escape-collision-world'
import {
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from './zombie-escape-config'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import {
  createZombieEscapeSimulation,
  resetZombieEscapeSimulation,
  setZombieEscapeCollisionWorld,
  setZombieEscapeGamePhase,
  setZombieEscapeObstacleDamageEnabled,
  spawnZombieEscapeZombie,
  stepZombieEscapeSimulation,
  ZOMBIE_ESCAPE_ZOMBIE_INTENT,
} from './zombie-escape-simulation'
import { createZombieEscapeArena } from './zombie-escape-world'

describe('Zombie Escape obstacle-damage policy', () => {
  test('keeps obstacle attacks live without topology mutation and resumes normal two-hit damage', () => {
    const arena = createZombieEscapeArena(91_101)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_102)
    const furniture = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boxes: [
        {
          breakable: true,
          centerX: 0,
          centerZ: 0,
          halfDepth: 1.2,
          halfWidth: 0.35,
          id: 'table:footprint',
          maximumY: 0.8,
          minimumY: 0,
          objectId: 'table',
          rotation: 0,
        },
      ],
      playRadius: arena.playRadius,
    })
    setZombieEscapeCollisionWorld(state, furniture)

    expect(state.obstacleDamageEnabled).toBe(true)
    setZombieEscapeObstacleDamageEnabled(state, false)
    resetZombieEscapeSimulation(state, arena)
    expect(state.obstacleDamageEnabled).toBe(false)

    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 1.5
    state.player.z = 0
    const zombie = spawnZombieEscapeZombie(state, -1.5, 0)
    const input = createZombieEscapeControlState()
    const collisionWorld = state.collisionWorld
    const collisionWorldGeneration = state.collisionWorldGeneration
    const obstacleRevision = state.obstacleRevision

    stepUntil(
      () => state.zombies.intent[zombie] === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle,
      () => stepZombieEscapeSimulation(state, input, 1 / 60, arena),
    )
    const firstImpactAfterSequence = state.audioEvents.writeSequence

    expect(readAudioEventKinds(state, firstImpactAfterSequence)).toEqual([])
    expect(state.zombies.attackContactResolved[zombie]).toBe(0)
    expect(state.zombies.attackCooldown[zombie]).toBeCloseTo(
      ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds,
      5,
    )
    stepUntil(
      () => readAudioEventKinds(state, firstImpactAfterSequence).length === 1,
      () => stepZombieEscapeSimulation(state, input, 1 / 60, arena),
    )
    expect(readAudioEventKinds(state, firstImpactAfterSequence)).toEqual([
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.environmentImpact,
    ])
    expect(state.zombies.attackContactResolved[zombie]).toBe(1)
    expect(state.zombies.intent[zombie]).toBe(ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle)
    expect(state.zombies.attackTargetObjectId[zombie]).toBe('table')
    expect(state.zombies.vx[zombie]).toBe(0)
    expect(state.zombies.vz[zombie]).toBe(0)
    expect(state.obstacleHitFeedback.get('table')).toBe(1)

    stepZombieEscapeSimulation(state, input, ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, arena)
    expect(state.obstacleHitFeedback.get('table')).toBeCloseTo(
      1 -
        ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds /
          ZOMBIE_ESCAPE_SIMULATION.zombieHitReactionSeconds,
      6,
    )

    stepUntil(
      () => readAudioEventKinds(state, firstImpactAfterSequence).length === 2,
      () => stepZombieEscapeSimulation(state, input, 1 / 60, arena),
    )
    expect(readAudioEventKinds(state, firstImpactAfterSequence)).toEqual([
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.environmentImpact,
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.environmentImpact,
    ])
    expect(state.obstacleHitCounts.size).toBe(0)
    expect(state.destroyedObstacleIds.size).toBe(0)
    expect(state.obstacleHitFeedback.get('table')).toBe(1)
    expect(state.obstacleRevision).toBe(obstacleRevision)
    expect(state.collisionWorldGeneration).toBe(collisionWorldGeneration)
    expect(state.collisionWorld).toBe(collisionWorld)
    expect(state.collisionWorld.boxes).toHaveLength(1)

    setZombieEscapeObstacleDamageEnabled(state, true)
    stepUntil(
      () => state.obstacleHitCounts.has('table'),
      () => stepZombieEscapeSimulation(state, input, 1 / 60, arena),
    )
    expect(state.obstacleHitCounts.get('table')).toBe(1)
    expect(state.destroyedObstacleIds.has('table')).toBe(false)
    expect(state.obstacleHitFeedback.get('table')).toBe(1)

    const combatCollisionWorld = state.combatCollisionWorld
    const navigationWorldRevision = state.navigationWorldRevision
    const navigationTargetRevision = state.navigationTargetRevision
    stepUntil(
      () => state.destroyedObstacleIds.has('table'),
      () => stepZombieEscapeSimulation(state, input, 1 / 60, arena),
    )
    expect(state.obstacleDamageEnabled).toBe(true)
    expect(state.obstacleHitCounts.has('table')).toBe(false)
    expect(state.destroyedObstacleIds.has('table')).toBe(true)
    expect(state.obstacleHitFeedback.has('table')).toBe(false)
    expect(state.obstacleRevision).toBe(obstacleRevision + 1)
    expect(state.collisionWorldGeneration).toBe(collisionWorldGeneration)
    expect(state.navigationWorldRevision).toBe(navigationWorldRevision + 1)
    expect(state.navigationTargetRevision).toBe(navigationTargetRevision)
    expect(state.collisionWorld).toBe(collisionWorld)
    expect(state.combatCollisionWorld).toBe(combatCollisionWorld)
    expect(state.collisionWorld.boxes).toHaveLength(1)
    expect(state.combatCollisionWorld.boxes).toHaveLength(1)
    expect(findFirstActiveZombieEscapeBreakableObjectId(state.collisionWorld)).toBeNull()
    expect(findFirstActiveZombieEscapeBreakableObjectId(state.combatCollisionWorld)).toBeNull()
    expect(state.obstacleDeltaMetrics.objectMaskWrites.total).toBe(2)
    expect(state.obstacleDeltaMetrics.viewRevisionAdvanceCount).toBe(2)
    expect(state.obstacleDeltaMetrics.worldCompileCount.total).toBe(0)
    expect(state.obstacleDeltaMetrics.fullArrayClearCount.total).toBe(0)
    expect(state.obstacleDeltaMetrics.allocationCount.total).toBe(0)
  })

  test('decays obstacle hit feedback over the zombie reaction interval and clears it on reset', () => {
    const arena = createZombieEscapeArena(91_103)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_104)
    const input = createZombieEscapeControlState()
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.obstacleHitFeedback.set('table', 1)

    stepZombieEscapeSimulation(state, input, ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, arena)
    expect(state.obstacleHitFeedback.get('table')).toBeCloseTo(
      1 -
        ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds /
          ZOMBIE_ESCAPE_SIMULATION.zombieHitReactionSeconds,
      6,
    )

    stepUntil(
      () => !state.obstacleHitFeedback.has('table'),
      () =>
        stepZombieEscapeSimulation(state, input, ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, arena),
      Math.ceil(
        ZOMBIE_ESCAPE_SIMULATION.zombieHitReactionSeconds /
          ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
      ) + 1,
    )

    state.obstacleHitFeedback.set('table', 1)
    resetZombieEscapeSimulation(state, arena)
    expect(state.obstacleHitFeedback.size).toBe(0)
  })

  test('clears obstacle hit feedback on terminal win and loss transitions', () => {
    const arena = createZombieEscapeArena(91_105)
    arena.obstacleCount = 0
    const input = createZombieEscapeControlState()
    const wonState = createZombieEscapeSimulation(arena, 91_106)
    wonState.extractionOpen = true
    wonState.player.x = arena.escapeX
    wonState.player.z = arena.escapeZ
    wonState.obstacleHitFeedback.set('table', 1)

    stepZombieEscapeSimulation(wonState, input, ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, arena)
    expect(wonState.status).toBe('won')
    expect(wonState.obstacleHitFeedback.size).toBe(0)

    const lostState = createZombieEscapeSimulation(arena, 91_107)
    setZombieEscapeGamePhase(lostState, 'night')
    lostState.waveSpawnRemaining = 0
    lostState.waveState = 'escape'
    lostState.player.health = 0
    lostState.obstacleHitFeedback.set('table', 1)

    stepZombieEscapeSimulation(lostState, input, ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, arena)
    expect(lostState.status).toBe('lost')
    expect(lostState.obstacleHitFeedback.size).toBe(0)
  })
})

function readAudioEventKinds(
  state: ReturnType<typeof createZombieEscapeSimulation>,
  afterSequence: number,
) {
  const kinds: ZombieEscapeAudioEventKind[] = []
  visitZombieEscapeAudioEventsAfter(state.audioEvents, afterSequence, (events, slot) => {
    kinds.push(events.kind[slot] as ZombieEscapeAudioEventKind)
  })
  return kinds
}

function stepUntil(condition: () => boolean, step: () => void, maximumSteps = 180) {
  for (let frame = 0; frame < maximumSteps && !condition(); frame += 1) step()
  expect(condition()).toBe(true)
}
