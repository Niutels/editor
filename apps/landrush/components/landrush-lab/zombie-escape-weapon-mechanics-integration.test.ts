import { describe, expect, test } from 'bun:test'
import {
  visitZombieEscapeAudioEventsAfter,
  ZOMBIE_ESCAPE_AUDIO_EVENT_KIND,
} from './zombie-escape-audio-events'
import { createZombieEscapeCollisionWorld } from './zombie-escape-collision-world'
import {
  ZOMBIE_ESCAPE_CAPACITY,
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_WEAPON_PROFILES,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from './zombie-escape-config'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import {
  createZombieEscapeSimulation,
  resetZombieEscapeSimulation,
  setZombieEscapeCollisionWorld,
  setZombieEscapeGamePhase,
  setZombieEscapePlayerMuzzlePose,
  spawnZombieEscapeZombie,
  stepZombieEscapeSimulation,
  ZOMBIE_ESCAPE_SHOT_IMPACT_KIND,
  ZOMBIE_ESCAPE_SHOT_PHASE,
  ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND,
  type ZombieEscapeSimulation,
} from './zombie-escape-simulation'
import { createZombieEscapeArena } from './zombie-escape-world'

describe('Zombie Escape weapon identities', () => {
  test('the impact pool covers a full launcher burst plus the largest live prior-fire tail', () => {
    const coil = ZOMBIE_ESCAPE_WEAPON_PROFILES[3]
    const maximumLiveCoilTriggers = Math.ceil(
      ZOMBIE_ESCAPE_SIMULATION.impactLifetimeSeconds / coil.shotIntervalSeconds,
    )
    const maximumLiveCoilEvents = maximumLiveCoilTriggers * (1 + coil.chainTargetCount)
    expect(ZOMBIE_ESCAPE_CAPACITY.impactEvents).toBeGreaterThanOrEqual(
      1 + ZOMBIE_ESCAPE_CAPACITY.zombies + maximumLiveCoilEvents,
    )
  })

  test('the Reef Carbine damages four aligned enemies, then terminates, while a wall is always terminal', () => {
    const arena = createZombieEscapeArena(61_001)
    arena.obstacleCount = 0
    const state = prepareWeaponState(arena, 1, 71_001)
    const zombies = [2, 3, 4, 5, 6].map((distance) =>
      spawnStationaryZombie(state, state.player.x, state.player.z - distance, 120),
    )
    const input = fireOnce(state, arena)
    stepUntilPrimaryShotSettles(state, input, arena)

    expect(zombies.slice(0, 4).map((slot) => state.zombies.health[slot])).toEqual([96, 96, 96, 96])
    expect(state.zombies.health[zombies[4]!]).toBe(120)
    expect(
      readActiveImpactSlots(state, ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.piercing),
    ).toHaveLength(4)
    expect(state.shots.impactKind[state.lastShotSlot]).toBe(ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy)

    const blocked = prepareWeaponState(arena, 1, 71_002)
    setZombieEscapeCollisionWorld(
      blocked,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        playRadius: arena.playRadius,
        segments: [
          {
            endX: blocked.player.x + 2,
            endZ: blocked.player.z - 3,
            halfThickness: 0.05,
            id: 'carbine-terminal-wall',
            startX: blocked.player.x - 2,
            startZ: blocked.player.z - 3,
          },
        ],
      }),
    )
    const beforeWall = spawnStationaryZombie(blocked, blocked.player.x, blocked.player.z - 2, 120)
    const behindWall = spawnStationaryZombie(blocked, blocked.player.x, blocked.player.z - 4, 120)
    const blockedInput = fireOnce(blocked, arena)
    stepUntilPrimaryShotSettles(blocked, blockedInput, arena)

    expect(blocked.zombies.health[beforeWall]).toBe(96)
    expect(blocked.zombies.health[behindWall]).toBe(120)
    expect(blocked.shots.impactKind[blocked.lastShotSlot]).toBe(
      ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment,
    )
  })

  test('the Driftwood Scattergun emits seven symmetric carriers from one trigger', () => {
    const arena = createZombieEscapeArena(61_002)
    arena.obstacleCount = 0
    const state = prepareWeaponState(arena, 2, 71_003)
    state.player.ammo = 5
    const input = createZombieEscapeControlState()
    input.fire = true
    stepZombieEscapeSimulation(state, input, ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, arena)

    const activeSlots = readActiveShotSlots(state)
    const primary = state.lastShotSlot
    expect(activeSlots).toHaveLength(7)
    expect(state.player.ammo).toBe(4)
    expect(state.shotsFired).toBe(1)
    expect(activeSlots.map((slot) => state.shots.volleySequence[slot])).toEqual(
      Array(7).fill(state.shots.volleySequence[primary]),
    )
    expect(activeSlots.map((slot) => state.shots.volleyOrdinal[slot])).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ])
    expect(activeSlots.filter((slot) => state.shots.primary[slot] !== 0)).toEqual([primary])
    for (let pair = 0; pair < 3; pair += 1) {
      const left = activeSlots[pair * 2 + 1]!
      const right = activeSlots[pair * 2 + 2]!
      expect(state.shots.directionX[left]).toBeCloseTo(-state.shots.directionX[right]!, 6)
      expect(state.shots.directionZ[left]).toBeCloseTo(state.shots.directionZ[right]!, 6)
    }
    expect(readAudioKinds(state)).toEqual([ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.shotFired])
  })

  test('the Storm-Coil Repeater chains once to the two nearest distinct visible targets', () => {
    const arena = createZombieEscapeArena(61_003)
    arena.obstacleCount = 0
    const state = prepareWeaponState(arena, 3, 71_004)
    const primary = spawnStationaryZombie(state, state.player.x, state.player.z - 2, 120)
    const nearest = spawnStationaryZombie(state, state.player.x + 0.8, state.player.z - 2.2, 120)
    const second = spawnStationaryZombie(state, state.player.x - 1.1, state.player.z - 2.2, 120)
    const third = spawnStationaryZombie(state, state.player.x + 2.2, state.player.z - 2.2, 120)
    const input = fireOnce(state, arena)
    stepUntilPrimaryShotSettles(state, input, arena)

    expect(state.zombies.health[primary]).toBe(100)
    expect(state.zombies.health[nearest]).toBe(111)
    expect(state.zombies.health[second]).toBe(111)
    expect(state.zombies.health[third]).toBe(120)
    const chainSlots = readActiveImpactSlots(state, ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.chain)
    expect(chainSlots).toHaveLength(2)
    expect(chainSlots.map((slot) => state.impactEvents.targetSlot[slot])).toEqual([nearest, second])
    expect(chainSlots[1]).toBeDefined()
    expect(state.impactEvents.sourceX[chainSlots[0]!]).toBe(
      state.impactEvents.sourceX[chainSlots[1]!],
    )
    expect(state.impactEvents.sourceZ[chainSlots[0]!]).toBe(
      state.impactEvents.sourceZ[chainSlots[1]!],
    )
  })

  test('the Tidebreak Launcher applies one falloff blast without double-hitting its direct target', () => {
    const arena = createZombieEscapeArena(61_004)
    arena.obstacleCount = 0
    const state = prepareWeaponState(arena, 4, 71_005)
    const direct = spawnStationaryZombie(state, state.player.x, state.player.z - 2.4, 400)
    const splash = spawnStationaryZombie(state, state.player.x + 1.6, state.player.z - 2.4, 400)
    const input = fireOnce(state, arena)
    stepUntilPrimaryShotSettles(state, input, arena)

    expect(state.zombies.health[direct]).toBe(220)
    const centralBlastSlots = readActiveImpactSlots(
      state,
      ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.blast,
    )
    const victimSlots = readActiveImpactSlots(
      state,
      ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.blastVictim,
    )
    expect(centralBlastSlots).toHaveLength(1)
    expect(state.impactEvents.targetSlot[centralBlastSlots[0]!]).toBe(direct)
    expect(victimSlots).toHaveLength(1)
    expect(state.impactEvents.targetSlot[victimSlots[0]!]).toBe(splash)
    expect(state.zombies.health[splash]).toBeCloseTo(
      400 - state.impactEvents.damage[victimSlots[0]!]!,
      4,
    )
    expect(state.impactEvents.damage[victimSlots[0]!]!).toBeGreaterThan(54)
    expect(state.impactEvents.damage[victimSlots[0]!]!).toBeLessThan(180)
    const survivingPresentationImpulse = Math.hypot(
      state.zombies.hitImpulseX[splash]!,
      state.zombies.hitImpulseY[splash]!,
      state.zombies.hitImpulseZ[splash]!,
    )
    expect(survivingPresentationImpulse).toBeGreaterThan(3.4)
    expect(survivingPresentationImpulse).toBeLessThan(4)
  })

  test('the Tidebreak blast damages the impact side of a wall but not zombies behind it', () => {
    const arena = createZombieEscapeArena(61_005)
    arena.obstacleCount = 0
    const state = prepareWeaponState(arena, 4, 71_006)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        playRadius: arena.playRadius,
        segments: [
          {
            endX: state.player.x + 2,
            endZ: state.player.z - 2,
            halfThickness: 0.05,
            id: 'launcher-occlusion-wall',
            startX: state.player.x - 2,
            startZ: state.player.z - 2,
          },
        ],
      }),
    )
    const visible = spawnStationaryZombie(state, state.player.x + 1.4, state.player.z - 1.15, 400)
    const occluded = spawnStationaryZombie(state, state.player.x, state.player.z - 3.5, 400)
    const input = fireOnce(state, arena)
    stepUntilPrimaryShotSettles(state, input, arena)

    expect(state.zombies.health[visible]).toBeLessThan(400)
    expect(state.zombies.health[occluded]).toBe(400)
    expect(state.shots.impactKind[state.lastShotSlot]).toBe(
      ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment,
    )
  })

  test('reset clears every carrier and immutable impact event before deterministic replay', () => {
    const arena = createZombieEscapeArena(61_006)
    arena.obstacleCount = 0
    const state = prepareWeaponState(arena, 3, 71_007)
    spawnStationaryZombie(state, state.player.x, state.player.z - 2, 120)
    spawnStationaryZombie(state, state.player.x + 0.8, state.player.z - 2.2, 120)
    const input = fireOnce(state, arena)
    stepUntilPrimaryShotSettles(state, input, arena)
    const firstDamage = [...state.impactEvents.damage]
    const firstEffectKinds = [...state.impactEvents.effectKind]
    expect(state.impactEvents.pool.activeCount).toBeGreaterThan(0)

    resetZombieEscapeSimulation(state, arena)
    expect(state.shots.pool.activeCount).toBe(0)
    expect(state.impactEvents.pool.activeCount).toBe(0)
    expect(state.nextShotVolleySequence).toBe(0)
    expect([...state.shots.lastPiercedTargetSlot].every((slot) => slot === -1)).toBe(true)

    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.weaponIndex = 3
    state.player.ammo = ZOMBIE_ESCAPE_WEAPON_PROFILES[3].ammoGranted
    spawnStationaryZombie(state, state.player.x, state.player.z - 2, 120)
    spawnStationaryZombie(state, state.player.x + 0.8, state.player.z - 2.2, 120)
    const replayInput = fireOnce(state, arena)
    stepUntilPrimaryShotSettles(state, replayInput, arena)

    expect([...state.impactEvents.damage]).toEqual(firstDamage)
    expect([...state.impactEvents.effectKind]).toEqual(firstEffectKinds)
  })

  test('impact events age in place and release at the deterministic fixed lifetime', () => {
    const arena = createZombieEscapeArena(61_007)
    arena.obstacleCount = 0
    const state = prepareWeaponState(arena, 0, 71_008)
    spawnStationaryZombie(state, state.player.x, state.player.z - 2, 120)
    const input = fireOnce(state, arena)
    stepUntilPrimaryShotSettles(state, input, arena)
    const [eventSlot] = readActiveImpactSlots(
      state,
      ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.projectile,
    )
    expect(eventSlot).toBeDefined()
    const eventGeneration = state.impactEvents.pool.generation[eventSlot!]!
    const stepsToRelease = Math.ceil(
      ZOMBIE_ESCAPE_SIMULATION.impactLifetimeSeconds / ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
    )

    for (let step = 0; step < stepsToRelease - 1; step += 1) {
      stepZombieEscapeSimulation(state, input, ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, arena)
    }
    expect(state.impactEvents.pool.active[eventSlot!]).toBe(1)
    expect(state.impactEvents.pool.generation[eventSlot!]).toBe(eventGeneration)
    stepZombieEscapeSimulation(state, input, ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, arena)
    expect(state.impactEvents.pool.active[eventSlot!]).toBe(0)
  })
})

function prepareWeaponState(
  arena: ReturnType<typeof createZombieEscapeArena>,
  weaponIndex: number,
  seed: number,
) {
  const state = createZombieEscapeSimulation(arena, seed)
  setZombieEscapeGamePhase(state, 'night')
  state.waveSpawnRemaining = 0
  state.waveState = 'escape'
  state.player.weaponIndex = weaponIndex
  state.player.ammo = ZOMBIE_ESCAPE_WEAPON_PROFILES[weaponIndex]!.ammoGranted
  setZombieEscapePlayerMuzzlePose(state, {
    directionX: 0,
    directionY: 0,
    directionZ: -1,
    x: state.player.x,
    y: state.player.y + ZOMBIE_ESCAPE_SIMULATION.defaultMuzzleHeight,
    z: state.player.z,
  })
  return state
}

function spawnStationaryZombie(
  state: ZombieEscapeSimulation,
  x: number,
  z: number,
  health: number,
) {
  const slot = spawnZombieEscapeZombie(state, x, z, health)
  expect(slot).toBeGreaterThanOrEqual(0)
  state.zombies.speedScale[slot] = 0
  return slot
}

function fireOnce(
  state: ZombieEscapeSimulation,
  arena: ReturnType<typeof createZombieEscapeArena>,
) {
  const input = createZombieEscapeControlState()
  input.fire = true
  stepZombieEscapeSimulation(state, input, ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, arena)
  input.fire = false
  return input
}

function stepUntilPrimaryShotSettles(
  state: ZombieEscapeSimulation,
  input: ReturnType<typeof createZombieEscapeControlState>,
  arena: ReturnType<typeof createZombieEscapeArena>,
) {
  for (
    let frame = 0;
    frame < 60 && state.shots.phase[state.lastShotSlot] === ZOMBIE_ESCAPE_SHOT_PHASE.travel;
    frame += 1
  ) {
    stepZombieEscapeSimulation(state, input, ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, arena)
  }
}

function readActiveShotSlots(state: ZombieEscapeSimulation) {
  const slots: number[] = []
  for (let slot = 0; slot < state.shots.pool.capacity; slot += 1) {
    if (state.shots.pool.active[slot] !== 0) slots.push(slot)
  }
  return slots
}

function readActiveImpactSlots(state: ZombieEscapeSimulation, effectKind: number) {
  const slots: number[] = []
  for (let slot = 0; slot < ZOMBIE_ESCAPE_CAPACITY.impactEvents; slot += 1) {
    if (
      state.impactEvents.pool.active[slot] !== 0 &&
      state.impactEvents.effectKind[slot] === effectKind
    ) {
      slots.push(slot)
    }
  }
  return slots
}

function readAudioKinds(state: ZombieEscapeSimulation) {
  const kinds: number[] = []
  visitZombieEscapeAudioEventsAfter(state.audioEvents, 0, (events, slot) => {
    kinds.push(events.kind[slot]!)
  })
  return kinds
}
