import { describe, expect, test } from 'bun:test'
import {
  clampZombieWeaponMechanicsProofTime,
  createZombieWeaponMechanicsHealthSnapshot,
  parseZombieWeaponMechanicsDebugQuery,
  ZOMBIE_WEAPON_MECHANICS_PROOF_DURATION_SECONDS,
  ZOMBIE_WEAPON_MECHANICS_SCENARIOS,
} from './zombie-weapon-mechanics-debug-state'

describe('zombie weapon mechanics debug state', () => {
  test('defines one deterministic formation for every production weapon', () => {
    expect(ZOMBIE_WEAPON_MECHANICS_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      'sunflare-pistol',
      'reef-carbine',
      'driftwood-scattergun',
      'storm-coil-repeater',
      'tidebreak-launcher',
    ])
    expect(
      ZOMBIE_WEAPON_MECHANICS_SCENARIOS.map((scenario) => scenario.targetPositions.length),
    ).toEqual([1, 4, 7, 4, 5])
  })

  test('parses fixed time and presentation without accepting unsupported modes', () => {
    expect(
      parseZombieWeaponMechanicsDebugQuery(new URLSearchParams(`time=0.75&view=no-post`)),
    ).toEqual({ timeSeconds: 0.75, variantIndex: 0, view: 'no-post', weaponId: null })
    expect(
      parseZombieWeaponMechanicsDebugQuery(
        new URLSearchParams('time=-1&view=diagnostic&weapon=reef-carbine&variant=5'),
      ),
    ).toEqual({
      timeSeconds: null,
      variantIndex: 4,
      view: 'final',
      weaponId: 'reef-carbine',
    })
    expect(parseZombieWeaponMechanicsDebugQuery(new URLSearchParams('weapon=unsupported'))).toEqual(
      { timeSeconds: null, variantIndex: 0, view: 'final', weaponId: null },
    )
    expect(
      parseZombieWeaponMechanicsDebugQuery(new URLSearchParams('variant=6')).variantIndex,
    ).toBe(0)
    expect(clampZombieWeaponMechanicsProofTime(99)).toBe(
      ZOMBIE_WEAPON_MECHANICS_PROOF_DURATION_SECONDS,
    )
  })

  test('reports unique damaged targets and aggregate damage without mutating inputs', () => {
    const initial = [200, 200, 200]
    const current = [164, 200, -10]
    expect(createZombieWeaponMechanicsHealthSnapshot(initial, current)).toEqual({
      damage: 236,
      damagedTargetCount: 2,
      remainingHealth: [164, 200, 0],
    })
    expect(initial).toEqual([200, 200, 200])
    expect(current).toEqual([164, 200, -10])
  })
})
