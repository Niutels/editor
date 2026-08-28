import { describe, expect, test } from 'bun:test'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'
import {
  createZombieEscapeWeaponRecoilPose,
  createZombieEscapeWeaponRecoilState,
  resolveZombieEscapeWeaponRecoilProfile,
  stepZombieEscapeWeaponRecoil,
  ZOMBIE_ESCAPE_WEAPON_RECOIL_PROFILES,
} from './zombie-escape-weapon-recoil'

describe('Zombie Escape weapon recoil', () => {
  test('defines a bounded weapon-specific profile for every production weapon', () => {
    expect(ZOMBIE_ESCAPE_WEAPON_RECOIL_PROFILES.map(({ weaponId }) => weaponId)).toEqual(
      ZOMBIE_ESCAPE_WEAPON_CATALOG.map(({ id }) => id),
    )
    expect(resolveZombieEscapeWeaponRecoilProfile(4).maximumTravelMeters).toBeGreaterThan(
      resolveZombieEscapeWeaponRecoilProfile(1).maximumTravelMeters,
    )
    expect(resolveZombieEscapeWeaponRecoilProfile(2).maximumMuzzleClimbRadians).toBeGreaterThan(
      resolveZombieEscapeWeaponRecoilProfile(0).maximumMuzzleClimbRadians,
    )
  })

  test('adds one impulse per new shot sequence and never retriggers a held value', () => {
    const state = createZombieEscapeWeaponRecoilState()
    const pose = createZombieEscapeWeaponRecoilPose()
    stepZombieEscapeWeaponRecoil(
      state,
      { deltaSeconds: 1 / 60, shotSequence: 1, weaponIndex: 0 },
      pose,
    )
    const firstVelocity = state.velocityMetersPerSecond
    expect(pose.backwardTravelMeters).toBeGreaterThan(0)

    stepZombieEscapeWeaponRecoil(state, { deltaSeconds: 0, shotSequence: 1, weaponIndex: 0 }, pose)
    expect(state.velocityMetersPerSecond).toBeCloseTo(firstVelocity, 12)

    stepZombieEscapeWeaponRecoil(state, { deltaSeconds: 0, shotSequence: 2, weaponIndex: 0 }, pose)
    expect(state.velocityMetersPerSecond).toBeGreaterThan(firstVelocity)
  })

  test('uses an analytic return that agrees across frame rates', () => {
    const sixtyHz = simulateSingleShot(1 / 60, 1)
    const oneTwentyHz = simulateSingleShot(1 / 120, 1)
    expect(sixtyHz.displacementMeters).toBeCloseTo(oneTwentyHz.displacementMeters, 10)
    expect(sixtyHz.velocityMetersPerSecond).toBeCloseTo(oneTwentyHz.velocityMetersPerSecond, 10)
  })

  test('stays bounded and keeps pulsing under every production held-fire cadence', () => {
    const shotIntervals = [0.19, 0.095, 0.42, 0.072, 0.68] as const
    for (let weaponIndex = 0; weaponIndex < shotIntervals.length; weaponIndex += 1) {
      const profile = resolveZombieEscapeWeaponRecoilProfile(weaponIndex)
      const state = createZombieEscapeWeaponRecoilState()
      const pose = createZombieEscapeWeaponRecoilPose()
      const interval = shotIntervals[weaponIndex]!
      let sequence = 0
      let nextShotAt = 0
      let maximumTravel = 0
      let visibleFrameCount = 0

      for (let elapsed = 0; elapsed < 2.2; elapsed += 1 / 120) {
        while (elapsed + 0.000_001 >= nextShotAt) {
          sequence += 1
          nextShotAt += interval
        }
        stepZombieEscapeWeaponRecoil(
          state,
          { deltaSeconds: 1 / 120, shotSequence: sequence, weaponIndex },
          pose,
        )
        maximumTravel = Math.max(maximumTravel, pose.backwardTravelMeters)
        if (pose.backwardTravelMeters > 0.001) visibleFrameCount += 1
        expect(pose.backwardTravelMeters).toBeLessThanOrEqual(profile.maximumTravelMeters)
        expect(pose.muzzleClimbRadians).toBeLessThanOrEqual(profile.maximumMuzzleClimbRadians)
      }

      expect(maximumTravel).toBeGreaterThan(profile.maximumTravelMeters * 0.25)
      expect(visibleFrameCount).toBeGreaterThan(120)

      for (let frame = 0; frame < 240; frame += 1) {
        stepZombieEscapeWeaponRecoil(
          state,
          { deltaSeconds: 1 / 120, shotSequence: sequence, weaponIndex },
          pose,
        )
      }
      expect(pose.backwardTravelMeters).toBeLessThan(0.000_01)
      expect(pose.muzzleClimbRadians).toBeLessThan(0.000_01)
    }
  })

  test('resets cleanly when a run returns its sequence to zero', () => {
    const state = createZombieEscapeWeaponRecoilState()
    const pose = createZombieEscapeWeaponRecoilPose()
    stepZombieEscapeWeaponRecoil(state, { deltaSeconds: 0, shotSequence: 0, weaponIndex: 4 }, pose)
    stepZombieEscapeWeaponRecoil(
      state,
      { deltaSeconds: 1 / 60, shotSequence: 7, weaponIndex: 4 },
      pose,
    )
    expect(pose.backwardTravelMeters).toBeGreaterThan(0)
    stepZombieEscapeWeaponRecoil(
      state,
      { deltaSeconds: 1 / 60, shotSequence: 0, weaponIndex: 4 },
      pose,
    )
    expect(pose.backwardTravelMeters).toBe(0)
    expect(state.velocityMetersPerSecond).toBe(0)
  })
})

function simulateSingleShot(deltaSeconds: number, durationSeconds: number) {
  const state = createZombieEscapeWeaponRecoilState()
  const pose = createZombieEscapeWeaponRecoilPose()
  stepZombieEscapeWeaponRecoil(state, { deltaSeconds: 0, shotSequence: 1, weaponIndex: 1 }, pose)
  const stepCount = Math.round(durationSeconds / deltaSeconds)
  for (let step = 0; step < stepCount; step += 1) {
    stepZombieEscapeWeaponRecoil(state, { deltaSeconds, shotSequence: 1, weaponIndex: 1 }, pose)
  }
  return state
}
