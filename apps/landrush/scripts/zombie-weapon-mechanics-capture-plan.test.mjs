import { describe, expect, test } from 'bun:test'
import {
  assertZombieWeaponMechanicsCaptureState,
  createZombieWeaponMechanicsCaptureTimes,
  createZombieWeaponMechanicsCaptureUrl,
  ZOMBIE_WEAPON_MECHANICS_CAPTURE_VARIANTS,
  ZOMBIE_WEAPON_MECHANICS_CAPTURE_WEAPONS,
} from './zombie-weapon-mechanics-capture-plan.mjs'

describe('zombie weapon mechanics capture plan', () => {
  test('creates inclusive evenly spaced deterministic samples', () => {
    expect(
      createZombieWeaponMechanicsCaptureTimes({
        endSeconds: 1,
        frameCount: 5,
        startSeconds: 0,
      }),
    ).toEqual([0, 0.25, 0.5, 0.75, 1])
    expect(() => createZombieWeaponMechanicsCaptureTimes({ frameCount: 1 })).toThrow(
      'at least two frames',
    )
  })

  test('targets the existing allowlisted route with fixed proof state', () => {
    const url = new URL(
      createZombieWeaponMechanicsCaptureUrl(
        'http://localhost:3002/ignored',
        'no-post',
        0.75,
        'reef-carbine',
        4,
      ),
    )
    expect(url.pathname).toBe('/landrush-lab/zombie-shooting-debug')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      mechanics: '1',
      time: '0.75',
      view: 'no-post',
      weapon: 'reef-carbine',
      variant: '4',
    })
    expect(() => createZombieWeaponMechanicsCaptureUrl('http://localhost:3002', 'other')).toThrow(
      'Unsupported',
    )
    expect(() =>
      createZombieWeaponMechanicsCaptureUrl('http://localhost:3002', 'final', 0, 'other'),
    ).toThrow('Unsupported')
    expect(() =>
      createZombieWeaponMechanicsCaptureUrl(
        'http://localhost:3002',
        'final',
        0,
        'reef-carbine',
        6,
      ),
    ).toThrow('variant')
    expect(ZOMBIE_WEAPON_MECHANICS_CAPTURE_VARIANTS).toEqual([1, 2, 3, 4, 5])
  })

  test('requires a ready five-weapon report', () => {
    const scenarios = [
      'sunflare-pistol',
      'reef-carbine',
      'driftwood-scattergun',
      'storm-coil-repeater',
      'tidebreak-launcher',
    ].map((id) => ({ id }))
    const state = { ready: true, scenarios, variantIndex: 0 }
    expect(assertZombieWeaponMechanicsCaptureState(state)).toBe(state)
    const single = {
      ready: true,
      scenarios: [{ id: ZOMBIE_WEAPON_MECHANICS_CAPTURE_WEAPONS[1] }],
      variantIndex: 3,
    }
    expect(assertZombieWeaponMechanicsCaptureState(single, 'reef-carbine', 4)).toBe(single)
    expect(() => assertZombieWeaponMechanicsCaptureState({ ready: false, scenarios })).toThrow(
      'readiness',
    )
    expect(() =>
      assertZombieWeaponMechanicsCaptureState({ ready: true, scenarios: scenarios.slice(1) }),
    ).toThrow('exactly five')
  })
})
