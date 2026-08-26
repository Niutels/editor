import { describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeId,
  BuildingNode,
  DoorNode,
  ItemNode,
  LevelNode,
  SlabNode,
  sceneRegistry,
  WallNode,
} from '@pascal-app/core'
import { Object3D } from 'three'
import { createLandrushZombieEscapeCollisionWorld } from './landrush-island-ai-navigation-semantics'
import { syncLandrushZombieEscapeStructureRoots } from './landrush-zombie-escape-structure-presentation'
import {
  visitZombieEscapeAudioEventsAfter,
  ZOMBIE_ESCAPE_AUDIO_EVENT_KIND,
  type ZombieEscapeAudioEventKind,
} from './zombie-escape-audio-events'
import { findFirstActiveZombieEscapeBreakableObjectId } from './zombie-escape-collision-world'
import {
  ZOMBIE_ESCAPE_OBSTACLE_BREACH_DURATION_SECONDS,
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from './zombie-escape-config'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import {
  createZombieEscapeSimulation,
  inspectZombieEscapeCommittedNavigationAction,
  setZombieEscapeCollisionWorld,
  setZombieEscapeExternalPlayerPose,
  setZombieEscapeGamePhase,
  spawnZombieEscapeZombie,
  stepZombieEscapeSimulation,
  ZOMBIE_ESCAPE_ZOMBIE_INTENT,
} from './zombie-escape-simulation'
import { createZombieEscapeArena } from './zombie-escape-world'

const FIXED_DELTA_SECONDS = 1 / 60
const PLAYER_X = 3
const ZOMBIE_X = -3

describe('Zombie Escape real Pascal obstacle attack integration', () => {
  test.each([
    ['DoorNode', createPascalDoorFixture],
    ['ItemNode', createPascalItemFixture],
  ] as const)('contact-aligns two authored strikes, removes the %s collider/root, and resumes pursuit', (_, createFixture) => {
    const arena = createZombieEscapeArena(97_101)
    arena.obstacleCount = 0
    const fixture = createFixture()
    const state = createZombieEscapeSimulation(arena, 97_102)
    setZombieEscapeCollisionWorld(state, fixture.world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = PLAYER_X
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()

    stepUntil(
      () => state.navigationTargetCommittedRouteGeneration > 0,
      () => stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena),
      1_200,
    )
    const zombie = spawnZombieEscapeZombie(state, ZOMBIE_X, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)

    stepUntil(
      () => state.zombies.intent[zombie] === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle,
      () => stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena),
      1_200,
    )
    const acquiredAtSeconds = state.elapsedSeconds
    const audioSequenceAtAcquisition = state.audioEvents.writeSequence
    expect(state.zombies.attackTargetObjectId[zombie]).toBe(fixture.objectId)
    expect(state.zombies.attackCooldown[zombie]).toBeCloseTo(
      ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds,
      5,
    )
    expect(state.zombies.attackContactResolved[zombie]).toBe(0)
    expect(state.obstacleHitCounts.has(fixture.objectId)).toBe(false)
    expect(readAudioEventKinds(state, audioSequenceAtAcquisition)).toEqual([])

    const contactSeconds =
      ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds *
      ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackContactPhase
    let elapsedBeforeFirstContact = 0
    stepUntil(
      () => state.obstacleHitCounts.get(fixture.objectId) === 1,
      () => {
        elapsedBeforeFirstContact = state.elapsedSeconds - acquiredAtSeconds
        stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
      },
      120,
    )
    const firstContactElapsed = state.elapsedSeconds - acquiredAtSeconds
    expect(elapsedBeforeFirstContact).toBeLessThan(contactSeconds)
    expect(firstContactElapsed).toBeGreaterThanOrEqual(contactSeconds)
    expect(firstContactElapsed - contactSeconds).toBeLessThanOrEqual(FIXED_DELTA_SECONDS)
    expect(state.zombies.attackTargetObjectId[zombie]).toBe(fixture.objectId)
    expect(readAudioEventKinds(state, audioSequenceAtAcquisition)).toEqual([
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.environmentImpact,
    ])

    let elapsedBeforeDestruction = firstContactElapsed
    stepUntil(
      () => state.destroyedObstacleIds.has(fixture.objectId),
      () => {
        elapsedBeforeDestruction = state.elapsedSeconds - acquiredAtSeconds
        stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
      },
      180,
    )
    const destroyedAtElapsed = state.elapsedSeconds - acquiredAtSeconds
    expect(elapsedBeforeDestruction).toBeLessThan(ZOMBIE_ESCAPE_OBSTACLE_BREACH_DURATION_SECONDS)
    expect(destroyedAtElapsed).toBeGreaterThanOrEqual(
      ZOMBIE_ESCAPE_OBSTACLE_BREACH_DURATION_SECONDS,
    )
    expect(destroyedAtElapsed - ZOMBIE_ESCAPE_OBSTACLE_BREACH_DURATION_SECONDS).toBeLessThanOrEqual(
      FIXED_DELTA_SECONDS,
    )
    expect(readAudioEventKinds(state, audioSequenceAtAcquisition)).toEqual([
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.environmentImpact,
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.environmentImpact,
    ])
    expect(state.obstacleHitCounts.has(fixture.objectId)).toBe(false)
    expect(findFirstActiveZombieEscapeBreakableObjectId(state.collisionWorld)).toBeNull()
    expect(findFirstActiveZombieEscapeBreakableObjectId(state.combatCollisionWorld)).toBeNull()

    const root = new Object3D()
    const hiddenRoots = new Map<Object3D, boolean>()
    sceneRegistry.nodes.set(fixture.objectId, root)
    try {
      const destroyedRoots = new Set<Object3D>()
      for (const objectId of state.destroyedObstacleIds) {
        const registeredRoot = sceneRegistry.nodes.get(objectId as AnyNodeId)
        if (registeredRoot) destroyedRoots.add(registeredRoot)
      }
      syncLandrushZombieEscapeStructureRoots(destroyedRoots, hiddenRoots)
      expect(destroyedRoots).toEqual(new Set([root]))
      expect(root.visible).toBe(false)
      expect(hiddenRoots.get(root)).toBe(true)
    } finally {
      sceneRegistry.nodes.delete(fixture.objectId)
    }

    const xAtDestruction = state.zombies.x[zombie]!
    stepUntil(
      () =>
        state.zombies.x[zombie]! > xAtDestruction + 0.05 &&
        ['direct', 'route'].includes(inspectZombieEscapeCommittedNavigationAction(state, zombie)),
      () => stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena),
      240,
    )
    expect(state.zombies.attackTargetObjectId[zombie]).toBeNull()
    expect(state.zombies.x[zombie]).toBeGreaterThan(xAtDestruction + 0.05)
    expect(['direct', 'route']).toContain(
      inspectZombieEscapeCommittedNavigationAction(state, zombie),
    )
  })
})

function createPascalDoorFixture() {
  const building = BuildingNode.parse({})
  const level = LevelNode.parse({ level: 0, parentId: building.id })
  const slab = createPascalSlab(level.id)
  const wall = WallNode.parse({ end: [0, 8], parentId: level.id, start: [0, -8] })
  const door = DoorNode.parse({
    parentId: wall.id,
    position: [8, 0, 0],
    wallId: wall.id,
    width: 1,
  })
  return { objectId: door.id, world: compilePascalWorld([building, level, slab, wall, door]) }
}

function createPascalItemFixture() {
  const building = BuildingNode.parse({})
  const level = LevelNode.parse({ level: 0, parentId: building.id })
  const slab = createPascalSlab(level.id)
  const item = ItemNode.parse({
    asset: {
      category: 'furniture',
      dimensions: [1, 1, 16],
      id: 'cabinet-asset',
      name: 'Cabinet',
      src: 'asset://cabinet',
      thumbnail: '',
    },
    parentId: level.id,
    position: [0, 0, 0],
  })
  return { objectId: item.id, world: compilePascalWorld([building, level, slab, item]) }
}

function createPascalSlab(parentId: string) {
  return SlabNode.parse({
    parentId,
    polygon: [
      [-8, -8],
      [8, -8],
      [8, 8],
      [-8, 8],
    ],
  })
}

function compilePascalWorld(nodes: readonly AnyNode[]) {
  return createLandrushZombieEscapeCollisionWorld({
    agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])) as Record<string, AnyNode>,
    playRadius: 8,
    spawn: { x: 0, z: 0 },
  })
}

function stepUntil(condition: () => boolean, step: () => void, maximumSteps: number) {
  for (let stepIndex = 0; stepIndex < maximumSteps && !condition(); stepIndex += 1) step()
  expect(condition()).toBe(true)
}

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
