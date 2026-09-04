import type { ZombieEscapeWeaponId } from '@landrush/zombie-gameplay/zombie-escape-weapon-catalog'
import { ZOMBIE_ESCAPE_WEAPON_VFX_VARIANT_COUNT } from './zombie-escape-weapon-vfx'

export type ZombieWeaponMechanicsDebugView = 'final' | 'no-post'

export type ZombieWeaponMechanicsScenario = Readonly<{
  formation: string
  id: ZombieEscapeWeaponId
  label: string
  targetPositions: readonly Readonly<{ x: number; z: number }>[]
}>

export type ZombieWeaponMechanicsDebugQuery = Readonly<{
  timeSeconds: number | null
  variantIndex: number
  view: ZombieWeaponMechanicsDebugView
  weaponId: ZombieEscapeWeaponId | null
}>

export type ZombieWeaponMechanicsHealthSnapshot = Readonly<{
  damage: number
  damagedTargetCount: number
  remainingHealth: readonly number[]
}>

export const ZOMBIE_WEAPON_MECHANICS_PROOF_DURATION_SECONDS = 2.6

export const ZOMBIE_WEAPON_MECHANICS_SCENARIOS = [
  {
    formation: 'single target',
    id: 'sunflare-pistol',
    label: 'Pistol · precise single hit',
    targetPositions: [{ x: 0, z: 0.4 }],
  },
  {
    formation: 'four aligned targets',
    id: 'reef-carbine',
    label: 'Carbine · four-contact pierce',
    targetPositions: [
      { x: 0, z: 2.2 },
      { x: 0, z: 0.65 },
      { x: 0, z: -0.9 },
      { x: 0, z: -2.45 },
    ],
  },
  {
    formation: 'seven-target fan',
    id: 'driftwood-scattergun',
    label: 'Scattergun · seven-projectile fan',
    targetPositions: [-2.13, -1.4, -0.7, 0, 0.7, 1.4, 2.13].map((x) => ({ x, z: -7 })),
  },
  {
    formation: 'primary with two close neighbors and one control',
    id: 'storm-coil-repeater',
    label: 'Storm coil · bounded chain cluster',
    targetPositions: [
      { x: 0, z: 0.5 },
      { x: -1.7, z: -0.15 },
      { x: 1.7, z: -0.15 },
      { x: 3.45, z: 0.5 },
    ],
  },
  {
    formation: 'tight blast cluster with one control',
    id: 'tidebreak-launcher',
    label: 'Launcher · radial blast cluster',
    targetPositions: [
      { x: 0, z: 0.45 },
      { x: -1.35, z: -0.45 },
      { x: 1.45, z: -0.55 },
      { x: 0, z: -1.75 },
      { x: 3.7, z: 0.45 },
    ],
  },
] as const satisfies readonly ZombieWeaponMechanicsScenario[]

export function parseZombieWeaponMechanicsDebugQuery(
  params: Pick<URLSearchParams, 'get'>,
): ZombieWeaponMechanicsDebugQuery {
  const requestedTime = params.get('time')
  const parsedTime = requestedTime === null ? Number.NaN : Number(requestedTime)
  const requestedVariant = Number(params.get('variant'))
  return {
    timeSeconds:
      Number.isFinite(parsedTime) && parsedTime >= 0
        ? clampZombieWeaponMechanicsProofTime(parsedTime)
        : null,
    variantIndex:
      Number.isInteger(requestedVariant) &&
      requestedVariant >= 1 &&
      requestedVariant <= ZOMBIE_ESCAPE_WEAPON_VFX_VARIANT_COUNT
        ? requestedVariant - 1
        : 0,
    view: params.get('view') === 'no-post' ? 'no-post' : 'final',
    weaponId:
      ZOMBIE_WEAPON_MECHANICS_SCENARIOS.find(({ id }) => id === params.get('weapon'))?.id ?? null,
  }
}

export function clampZombieWeaponMechanicsProofTime(timeSeconds: number) {
  if (!Number.isFinite(timeSeconds)) return 0
  return Math.min(ZOMBIE_WEAPON_MECHANICS_PROOF_DURATION_SECONDS, Math.max(0, timeSeconds))
}

export function createZombieWeaponMechanicsHealthSnapshot(
  initialHealth: readonly number[],
  currentHealth: readonly number[],
): ZombieWeaponMechanicsHealthSnapshot {
  const remainingHealth = initialHealth.map((health, index) =>
    Math.max(0, Math.min(health, currentHealth[index] ?? health)),
  )
  let damage = 0
  let damagedTargetCount = 0
  for (let index = 0; index < initialHealth.length; index += 1) {
    const lostHealth = Math.max(0, initialHealth[index]! - remainingHealth[index]!)
    damage += lostHealth
    if (lostHealth > 0.000_1) damagedTargetCount += 1
  }
  return {
    damage: Number(damage.toFixed(3)),
    damagedTargetCount,
    remainingHealth,
  }
}
