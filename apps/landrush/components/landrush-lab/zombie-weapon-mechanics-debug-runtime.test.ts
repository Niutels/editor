import { describe, expect, test } from 'bun:test'
import {
  advanceZombieWeaponMechanicsScenarioRuntime,
  createZombieWeaponMechanicsScenarioRuntime,
} from './zombie-weapon-mechanics-debug-runtime'
import { ZOMBIE_WEAPON_MECHANICS_SCENARIOS } from './zombie-weapon-mechanics-debug-state'

describe('zombie weapon mechanics production proof runtime', () => {
  test('drives the real simulation to the expected five distinct outcomes', () => {
    const runtimes = ZOMBIE_WEAPON_MECHANICS_SCENARIOS.map((scenario) =>
      createZombieWeaponMechanicsScenarioRuntime(scenario),
    )
    for (const runtime of runtimes) {
      expect(runtime.simulation.player.weaponInventoryMask & (1 << runtime.weaponIndex)).not.toBe(0)
      expect(runtime.simulation.player.weaponAmmoByIndex[runtime.weaponIndex]).toBe(
        runtime.initialPlayerAmmo,
      )
    }
    const reports = runtimes.map((runtime) =>
      advanceZombieWeaponMechanicsScenarioRuntime(runtime, 2.6),
    )

    expect(reports.map(({ id, shotsFired }) => [id, shotsFired])).toEqual(
      ZOMBIE_WEAPON_MECHANICS_SCENARIOS.map(({ id }) => [id, 1]),
    )
    expect(reports.map(({ projectileCount }) => projectileCount)).toEqual([1, 1, 7, 1, 1])
    expect(reports.map(({ damagedTargetCount }) => damagedTargetCount)).toEqual([1, 4, 7, 3, 4])
    expect(reports[1]?.effectContacts.piercing).toBe(4)
    expect(reports[3]?.effectContacts.chain).toBe(2)
    expect(reports[4]?.effectContacts['blast-victim']).toBe(3)
  })

  test('is deterministic across repeated construction and fixed-time advancement', () => {
    const scenario = ZOMBIE_WEAPON_MECHANICS_SCENARIOS[4]!
    const first = advanceZombieWeaponMechanicsScenarioRuntime(
      createZombieWeaponMechanicsScenarioRuntime(scenario),
      2.6,
    )
    const replay = advanceZombieWeaponMechanicsScenarioRuntime(
      createZombieWeaponMechanicsScenarioRuntime(scenario),
      2.6,
    )
    expect(replay).toEqual(first)
  })
})
