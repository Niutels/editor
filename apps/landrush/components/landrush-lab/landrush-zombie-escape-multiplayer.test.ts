import { describe, expect, test } from 'bun:test'
import { isMultiplayerPlayerCombatSnapshot } from '@landrush/protocol'
import { createLandrushZombieEscapeCombatSnapshot } from './landrush-zombie-escape-multiplayer'
import { ZOMBIE_ESCAPE_SIMULATION, ZOMBIE_ESCAPE_WEAPON_PROFILES } from './zombie-escape-config'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import {
  createZombieEscapeSimulation,
  setZombieEscapeGamePhase,
  setZombieEscapePlayerMuzzlePose,
  stepZombieEscapeSimulation,
  ZOMBIE_ESCAPE_SHOT_IMPACT_KIND,
  ZOMBIE_ESCAPE_SHOT_PHASE,
} from './zombie-escape-simulation'
import { createZombieEscapeArena } from './zombie-escape-world'

function firingFixture(weaponIndex: number) {
  const arena = createZombieEscapeArena(71_890)
  arena.obstacleCount = 0
  const simulation = createZombieEscapeSimulation(arena, 71_891)
  setZombieEscapeGamePhase(simulation, 'night')
  simulation.nextZombieSpawnSeconds = Number.POSITIVE_INFINITY
  simulation.player.weaponIndex = weaponIndex
  simulation.player.ammo = ZOMBIE_ESCAPE_WEAPON_PROFILES[weaponIndex]!.ammoGranted
  setZombieEscapePlayerMuzzlePose(simulation, {
    directionX: 0,
    directionY: 0,
    directionZ: -1,
    x: simulation.player.x,
    y: 1.1,
    z: simulation.player.z - 0.7,
  })
  const input = createZombieEscapeControlState()
  input.fire = true
  stepZombieEscapeSimulation(simulation, input, ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, arena)
  return { arena, input, simulation }
}

describe('Zombie Escape multiplayer snapshots', () => {
  test('sends real inventory and every pellet in world coordinates for all weapons', () => {
    const origin = { x: 100, y: 7, z: -200 }
    for (
      let weaponIndex = 0;
      weaponIndex < ZOMBIE_ESCAPE_WEAPON_PROFILES.length;
      weaponIndex += 1
    ) {
      const { simulation } = firingFixture(weaponIndex)
      const wire = createLandrushZombieEscapeCombatSnapshot(simulation, origin)
      const profile = ZOMBIE_ESCAPE_WEAPON_PROFILES[weaponIndex]!
      expect(isMultiplayerPlayerCombatSnapshot(wire)).toBe(true)
      expect(wire.weaponIndex).toBe(weaponIndex)
      expect(wire.ammo).toBe(profile.ammoGranted - 1)
      expect(wire.shotSequence).toBe(1)
      expect(wire.shots).toHaveLength(profile.pelletCount)
      expect(new Set(wire.shots.map((shot) => shot.id)).size).toBe(profile.pelletCount)
      const primary = simulation.lastShotSlot
      expect(wire.shots[0]!.position).toEqual([
        simulation.shots.x[primary]! + origin.x,
        simulation.shots.y[primary]! + origin.y,
        simulation.shots.z[primary]! + origin.z,
      ])
    }
  })

  test('keeps published snapshots immutable as the local simulation advances', () => {
    const { arena, input, simulation } = firingFixture(0)
    const origin = { x: 0, y: 0, z: 0 }
    const first = createLandrushZombieEscapeCombatSnapshot(simulation, origin)
    const retained = structuredClone(first)
    input.fire = false
    for (let tick = 0; tick < 90; tick += 1) {
      stepZombieEscapeSimulation(
        simulation,
        input,
        ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
        arena,
      )
    }
    const next = createLandrushZombieEscapeCombatSnapshot(simulation, origin)
    expect(first).toEqual(retained)
    expect(next.shots).toHaveLength(0)
    expect(next.ammo).toBe(first.ammo)
    expect(simulation.shotsFired).toBe(1)
  })

  test('removes expired tracers and includes empty-ammo melee state', () => {
    const { simulation } = firingFixture(0)
    const slot = simulation.lastShotSlot
    simulation.shots.phase[slot] = ZOMBIE_ESCAPE_SHOT_PHASE.impact
    simulation.shots.impactKind[slot] = ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.expired
    simulation.player.ammo = 0
    simulation.player.meleePhase = 'active'
    const wire = createLandrushZombieEscapeCombatSnapshot(simulation, { x: 0, y: 0, z: 0 })
    expect(wire.shots).toHaveLength(0)
    expect(wire.ammo).toBe(0)
    expect(wire.meleePhase).toBe('active')
    expect(isMultiplayerPlayerCombatSnapshot(wire)).toBe(true)
  })
})
