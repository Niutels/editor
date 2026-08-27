import { describe, expect, test } from 'bun:test'
import { type AnyNode, BuildingNode, FenceNode, LevelNode, SlabNode } from '@pascal-app/core'
import { createLandrushZombieEscapeCollisionWorldsResolver } from './landrush-island-ai-navigation-semantics'
import {
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from './zombie-escape-config'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import {
  createZombieEscapeSimulation,
  setZombieEscapeCollisionWorld,
  setZombieEscapeGamePhase,
  spawnZombieEscapeZombie,
  stepZombieEscapeSimulation,
  ZOMBIE_ESCAPE_ZOMBIE_INTENT,
} from './zombie-escape-simulation'
import { createZombieEscapeArena } from './zombie-escape-world'

describe('Zombie Escape fence attacks', () => {
  test('attacks and destroys a blocking Pascal fence before continuing toward the player', () => {
    const building = BuildingNode.parse({
      children: ['level_fence_attack'],
      id: 'building_fence_attack',
    })
    const level = LevelNode.parse({
      children: ['slab_fence_attack', 'fence_attack'],
      id: 'level_fence_attack',
      level: 0,
      parentId: building.id,
    })
    const slab = SlabNode.parse({
      id: 'slab_fence_attack',
      parentId: level.id,
      polygon: [
        [-4, -4],
        [4, -4],
        [4, 4],
        [-4, 4],
      ],
    })
    const fence = FenceNode.parse({
      end: [0, 4],
      height: 1.2,
      id: 'fence_attack',
      parentId: level.id,
      start: [0, -4],
      thickness: 0.12,
    })
    const nodes = Object.fromEntries(
      [building, level, slab, fence].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>
    const arena = createZombieEscapeArena(72_001)
    arena.obstacleCount = 0
    const worlds = createLandrushZombieEscapeCollisionWorldsResolver()({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      nodes,
      playRadius: arena.playRadius,
      spawn: { x: 0, z: 0 },
    })
    const navigationFenceSegments = worlds.navigation.segments.filter(
      ({ objectId }) => objectId === fence.id,
    )
    const combatFenceSegments = worlds.combat.segments.filter(
      ({ objectId }) => objectId === fence.id,
    )

    expect(navigationFenceSegments.length).toBeGreaterThan(0)
    expect(navigationFenceSegments.every(({ breakable }) => breakable)).toBe(true)
    expect(combatFenceSegments.every(({ breakable }) => breakable)).toBe(true)
    expect(worlds.navigation.breakableObjectIds.has(fence.id)).toBe(true)
    expect(worlds.combat.breakableObjectIds.has(fence.id)).toBe(true)

    const state = createZombieEscapeSimulation(arena, 72_002)
    setZombieEscapeCollisionWorld(state, worlds.navigation, worlds.combat)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 1.5
    state.player.y = 0
    state.player.z = 0
    const zombie = spawnZombieEscapeZombie(state, -1.5, 0)
    state.zombies.attackCooldown[zombie] = 0
    const input = createZombieEscapeControlState()
    let sawFenceAttack = false

    const maximumFrames = Math.ceil(
      (8 + ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds * 2) * 60,
    )
    for (
      let frame = 0;
      frame < maximumFrames && !state.destroyedObstacleIds.has(fence.id);
      frame += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      sawFenceAttack ||=
        state.zombies.intent[zombie] === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle &&
        state.zombies.attackTargetObjectId[zombie] === fence.id
    }

    expect(sawFenceAttack).toBe(true)
    expect(state.destroyedObstacleIds.has(fence.id)).toBe(true)
    expect(state.obstacleHitCounts.has(fence.id)).toBe(false)
    expect(
      state.collisionWorld.activeObjectMask[
        state.collisionWorld.objectCatalog.objectIds.indexOf(fence.id)
      ],
    ).toBe(0)

    const xAtDestruction = state.zombies.x[zombie]!
    for (let frame = 0; frame < 180 && state.zombies.x[zombie]! <= 0.25; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.zombies.x[zombie]).toBeGreaterThan(Math.max(0.25, xAtDestruction))
  })
})
