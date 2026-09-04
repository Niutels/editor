import { describe, expect, test } from 'bun:test'
import { createLandrushZombieEscapeCollisionWorldsResolver } from '@landrush/pascal-host/zombie-game-navigation'
import {
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from '@landrush/zombie-gameplay/zombie-escape-config'
import { createZombieEscapeControlState } from '@landrush/zombie-gameplay/zombie-escape-controls'
import {
  createZombieEscapeSimulation,
  setZombieEscapeCollisionWorld,
  setZombieEscapeGamePhase,
  spawnZombieEscapeZombie,
  stepZombieEscapeSimulation,
  ZOMBIE_ESCAPE_ZOMBIE_INTENT,
} from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { createZombieEscapeArena } from '@landrush/zombie-gameplay/zombie-escape-world'
import { type AnyNode, BuildingNode, FenceNode, LevelNode, SlabNode } from '@pascal-app/core'

describe('Zombie Escape fence attacks', () => {
  test('attacks and destroys a blocking Pascal fence before continuing toward the player', () => {
    const { arena, fence, input, state, worlds, zombie } = createFenceAttackScenario(72_001)
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

    let sawFenceAttack = false
    let sawFirstHitWithRenewalEvidence = false

    const maximumFrames = Math.ceil(
      (8 + ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds * 2) * 60,
    )
    for (
      let frame = 0;
      frame < maximumFrames && !state.destroyedObstacleIds.has(fence.id);
      frame += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      const attacksFence =
        state.zombies.intent[zombie] === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle &&
        state.zombies.attackTargetObjectId[zombie] === fence.id
      if (!sawFenceAttack && attacksFence) {
        sawFenceAttack = true
        expect(state.zombies.attackObstacleRenewalEvidence[zombie]).toBe(0)
      }
      if (
        state.obstacleHitCounts.get(fence.id) === 1 &&
        state.zombies.attackObstacleRenewalEvidence[zombie] === 1
      ) {
        sawFirstHitWithRenewalEvidence = true
        expect(state.zombies.intent[zombie]).toBe(ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle)
        expect(state.zombies.attackTargetObjectId[zombie]).toBe(fence.id)
      }
    }

    expect(sawFenceAttack).toBe(true)
    expect(sawFirstHitWithRenewalEvidence).toBe(true)
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

  test('finishes one committed contact but does not renew after the blocker becomes lateral', () => {
    const { arena, fence, input, state, zombie } = createFenceAttackScenario(72_003)
    let beganFenceAttack = false
    for (let frame = 0; frame < 480 && !beganFenceAttack; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      beganFenceAttack =
        state.zombies.intent[zombie] === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle &&
        state.zombies.attackTargetObjectId[zombie] === fence.id
    }
    expect(beganFenceAttack).toBe(true)

    state.player.x = state.zombies.x[zombie]!
    state.player.y = state.zombies.y[zombie]!
    state.player.z = state.zombies.z[zombie]! + 3
    let leftFenceAttack = false
    const framesAfterRedirect = Math.ceil(
      (ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds * 2 + 1) * 60,
    )
    for (let frame = 0; frame < framesAfterRedirect; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      leftFenceAttack ||=
        state.zombies.intent[zombie] !== ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle ||
        state.zombies.attackTargetObjectId[zombie] !== fence.id
    }

    expect(state.obstacleHitCounts.get(fence.id)).toBe(1)
    expect(state.destroyedObstacleIds.has(fence.id)).toBe(false)
    expect(leftFenceAttack).toBe(true)
  })

  test('never attacks a stale lateral fence target while making route progress', () => {
    const { arena, fence, input, state, zombie } = createFenceAttackScenario(72_005, {
      playerX: -0.75,
      playerZ: 2.5,
      zombieX: -0.75,
      zombieZ: -2.5,
    })
    const fenceOrdinal = state.collisionWorld.objectCatalog.objectIds.indexOf(fence.id)
    expect(fenceOrdinal).toBeGreaterThanOrEqual(0)
    state.zombies.attackTargetObjectId[zombie] = fence.id
    state.zombies.attackTargetObjectOrdinal[zombie] = fenceOrdinal
    state.zombies.attackFocusX[zombie] = 0
    state.zombies.attackFocusZ[zombie] = state.zombies.z[zombie]!
    const startZ = state.zombies.z[zombie]!
    let attackedFence = false

    for (let frame = 0; frame < 120; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      attackedFence ||=
        state.zombies.intent[zombie] === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle &&
        state.zombies.attackTargetObjectId[zombie] === fence.id
    }

    expect(attackedFence).toBe(false)
    expect(state.obstacleHitCounts.has(fence.id)).toBe(false)
    expect(state.destroyedObstacleIds.has(fence.id)).toBe(false)
    expect(state.zombies.z[zombie]).toBeGreaterThan(startZ + 0.25)
  })
})

function createFenceAttackScenario(
  seed: number,
  positions: Readonly<{
    playerX: number
    playerZ: number
    zombieX: number
    zombieZ: number
  }> = {
    playerX: 1.5,
    playerZ: 0,
    zombieX: -1.5,
    zombieZ: 0,
  },
) {
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
  const arena = createZombieEscapeArena(seed)
  arena.obstacleCount = 0
  const worlds = createLandrushZombieEscapeCollisionWorldsResolver()({
    agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
    nodes,
    playRadius: arena.playRadius,
    spawn: { x: 0, z: 0 },
  })
  const state = createZombieEscapeSimulation(arena, seed + 1)
  setZombieEscapeCollisionWorld(state, worlds.navigation, worlds.combat)
  setZombieEscapeGamePhase(state, 'night')
  state.waveSpawnRemaining = 0
  state.waveState = 'escape'
  state.player.x = positions.playerX
  state.player.y = 0
  state.player.z = positions.playerZ
  const zombie = spawnZombieEscapeZombie(state, positions.zombieX, positions.zombieZ)
  expect(zombie).toBeGreaterThanOrEqual(0)
  state.zombies.attackCooldown[zombie] = 0
  const input = createZombieEscapeControlState()
  return { arena, fence, input, state, worlds, zombie }
}
