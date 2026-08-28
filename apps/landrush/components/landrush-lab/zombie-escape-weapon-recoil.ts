export type ZombieEscapeWeaponRecoilProfile = Readonly<{
  maximumMuzzleClimbRadians: number
  maximumTravelMeters: number
  returnAngularFrequencyRadiansPerSecond: number
  shotImpulseVelocityMetersPerSecond: number
  weaponId: string
}>

export type ZombieEscapeWeaponRecoilState = {
  displacementMeters: number
  observedShotSequence: number
  velocityMetersPerSecond: number
  weaponIndex: number
}

export type ZombieEscapeWeaponRecoilPose = {
  backwardTravelMeters: number
  muzzleClimbRadians: number
}

export const ZOMBIE_ESCAPE_WEAPON_RECOIL_PROFILES = [
  {
    maximumMuzzleClimbRadians: (Math.PI / 180) * 6,
    maximumTravelMeters: 0.055,
    returnAngularFrequencyRadiansPerSecond: 24,
    shotImpulseVelocityMetersPerSecond: 2.35,
    weaponId: 'sunflare-pistol',
  },
  {
    maximumMuzzleClimbRadians: (Math.PI / 180) * 4.5,
    maximumTravelMeters: 0.06,
    returnAngularFrequencyRadiansPerSecond: 29,
    shotImpulseVelocityMetersPerSecond: 2.35,
    weaponId: 'reef-carbine',
  },
  {
    maximumMuzzleClimbRadians: (Math.PI / 180) * 14,
    maximumTravelMeters: 0.14,
    returnAngularFrequencyRadiansPerSecond: 16.5,
    shotImpulseVelocityMetersPerSecond: 4.5,
    weaponId: 'driftwood-scattergun',
  },
  {
    maximumMuzzleClimbRadians: (Math.PI / 180) * 4,
    maximumTravelMeters: 0.055,
    returnAngularFrequencyRadiansPerSecond: 33,
    shotImpulseVelocityMetersPerSecond: 2.15,
    weaponId: 'storm-coil-repeater',
  },
  {
    maximumMuzzleClimbRadians: (Math.PI / 180) * 17,
    maximumTravelMeters: 0.18,
    returnAngularFrequencyRadiansPerSecond: 13.5,
    shotImpulseVelocityMetersPerSecond: 4.9,
    weaponId: 'tidebreak-launcher',
  },
] as const satisfies readonly ZombieEscapeWeaponRecoilProfile[]

const MAXIMUM_SHOT_IMPULSES_PER_STEP = 4
const MAXIMUM_STEP_SECONDS = 0.1

export function createZombieEscapeWeaponRecoilState(): ZombieEscapeWeaponRecoilState {
  return {
    displacementMeters: 0,
    observedShotSequence: 0,
    velocityMetersPerSecond: 0,
    weaponIndex: 0,
  }
}

export function createZombieEscapeWeaponRecoilPose(): ZombieEscapeWeaponRecoilPose {
  return {
    backwardTravelMeters: 0,
    muzzleClimbRadians: 0,
  }
}

export function resetZombieEscapeWeaponRecoil(
  state: ZombieEscapeWeaponRecoilState,
  weaponIndex: number,
  shotSequence: number,
) {
  state.displacementMeters = 0
  state.observedShotSequence = normalizeShotSequence(shotSequence, 0)
  state.velocityMetersPerSecond = 0
  state.weaponIndex = resolveZombieEscapeWeaponRecoilProfileIndex(weaponIndex)
}

export function resolveZombieEscapeWeaponRecoilProfile(
  weaponIndex: number,
): ZombieEscapeWeaponRecoilProfile {
  return ZOMBIE_ESCAPE_WEAPON_RECOIL_PROFILES[
    resolveZombieEscapeWeaponRecoilProfileIndex(weaponIndex)
  ]!
}

export function stepZombieEscapeWeaponRecoil(
  state: ZombieEscapeWeaponRecoilState,
  {
    deltaSeconds,
    shotSequence,
    weaponIndex,
  }: {
    deltaSeconds: number
    shotSequence: number
    weaponIndex: number
  },
  pose: ZombieEscapeWeaponRecoilPose,
) {
  const resolvedWeaponIndex = resolveZombieEscapeWeaponRecoilProfileIndex(weaponIndex)
  const resolvedShotSequence = normalizeShotSequence(shotSequence, state.observedShotSequence)
  if (resolvedWeaponIndex !== state.weaponIndex || resolvedShotSequence === 0) {
    resetZombieEscapeWeaponRecoil(state, resolvedWeaponIndex, resolvedShotSequence)
    pose.backwardTravelMeters = 0
    pose.muzzleClimbRadians = 0
    return pose
  }

  const profile = ZOMBIE_ESCAPE_WEAPON_RECOIL_PROFILES[resolvedWeaponIndex]!
  const shotCount = Math.min(
    MAXIMUM_SHOT_IMPULSES_PER_STEP,
    countForwardShotSequence(state.observedShotSequence, resolvedShotSequence),
  )
  state.observedShotSequence = resolvedShotSequence
  state.velocityMetersPerSecond += profile.shotImpulseVelocityMetersPerSecond * shotCount

  const safeDeltaSeconds = Number.isFinite(deltaSeconds)
    ? Math.min(MAXIMUM_STEP_SECONDS, Math.max(0, deltaSeconds))
    : 0
  const angularFrequency = profile.returnAngularFrequencyRadiansPerSecond
  const displacement = state.displacementMeters
  const velocity = state.velocityMetersPerSecond
  const criticalResponse = velocity + angularFrequency * displacement
  const decay = Math.exp(-angularFrequency * safeDeltaSeconds)
  state.displacementMeters = (displacement + criticalResponse * safeDeltaSeconds) * decay
  state.velocityMetersPerSecond =
    (velocity - angularFrequency * criticalResponse * safeDeltaSeconds) * decay

  if (
    Math.abs(state.displacementMeters) < 0.000_001 &&
    Math.abs(state.velocityMetersPerSecond) < 0.000_01
  ) {
    state.displacementMeters = 0
    state.velocityMetersPerSecond = 0
  }

  const normalizedTravel = Math.tanh(
    Math.max(0, state.displacementMeters) / profile.maximumTravelMeters,
  )
  pose.backwardTravelMeters = profile.maximumTravelMeters * normalizedTravel
  pose.muzzleClimbRadians = profile.maximumMuzzleClimbRadians * normalizedTravel
  return pose
}

function countForwardShotSequence(previous: number, current: number) {
  if (previous === current) return 0
  if (current > previous) return current - previous
  return 0xffff_ffff - previous + current
}

function normalizeShotSequence(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) >>> 0 : fallback
}

function resolveZombieEscapeWeaponRecoilProfileIndex(value: number) {
  if (!Number.isFinite(value)) return 0
  const index = Math.trunc(value)
  return index >= 0 && index < ZOMBIE_ESCAPE_WEAPON_RECOIL_PROFILES.length ? index : 0
}
