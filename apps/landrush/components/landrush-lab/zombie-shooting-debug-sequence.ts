import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'

export const ZOMBIE_SHOOTING_DEBUG_SEGMENT_SECONDS = 3.2
export const ZOMBIE_SHOOTING_DEBUG_SHOT_TIMES_SECONDS = [0.72, 1.76] as const
export const ZOMBIE_SHOOTING_DEBUG_PROJECTILE_TRAVEL_SECONDS = 0.24
export const ZOMBIE_SHOOTING_DEBUG_AUTO_SEQUENCE_SECONDS =
  ZOMBIE_SHOOTING_DEBUG_SEGMENT_SECONDS * ZOMBIE_ESCAPE_WEAPON_CATALOG.length

export type ZombieShootingDebugSequenceEvent = Readonly<{
  kind: 'impact' | 'shot'
  timeSeconds: number
  weaponIndex: number
}>

export function resolveZombieShootingDebugWeaponIndex(
  elapsedSeconds: number,
  autoAllWeapons: boolean,
  selectedWeaponIndex: number,
) {
  const safeSelectedWeaponIndex = clampWeaponIndex(selectedWeaponIndex)
  if (!autoAllWeapons) return safeSelectedWeaponIndex
  const sequenceTime = positiveModulo(
    Math.max(0, elapsedSeconds),
    ZOMBIE_SHOOTING_DEBUG_AUTO_SEQUENCE_SECONDS,
  )
  return Math.min(
    ZOMBIE_ESCAPE_WEAPON_CATALOG.length - 1,
    Math.floor(sequenceTime / ZOMBIE_SHOOTING_DEBUG_SEGMENT_SECONDS),
  )
}

export function resolveZombieShootingDebugSegmentTime(elapsedSeconds: number) {
  return positiveModulo(Math.max(0, elapsedSeconds), ZOMBIE_SHOOTING_DEBUG_SEGMENT_SECONDS)
}

export function visitZombieShootingDebugSequenceEvents(
  previousElapsedSeconds: number,
  elapsedSeconds: number,
  autoAllWeapons: boolean,
  selectedWeaponIndex: number,
  visitor: (event: ZombieShootingDebugSequenceEvent) => void,
) {
  const start = Math.max(0, previousElapsedSeconds)
  const end = Math.max(0, elapsedSeconds)
  if (end <= start) return

  const period = autoAllWeapons
    ? ZOMBIE_SHOOTING_DEBUG_AUTO_SEQUENCE_SECONDS
    : ZOMBIE_SHOOTING_DEBUG_SEGMENT_SECONDS
  const firstCycle = Math.floor(start / period)
  const lastCycle = Math.floor(end / period)
  const selectedIndex = clampWeaponIndex(selectedWeaponIndex)

  for (let cycle = firstCycle; cycle <= lastCycle; cycle += 1) {
    const cycleStart = cycle * period
    const firstWeaponIndex = autoAllWeapons ? 0 : selectedIndex
    const lastWeaponIndex = autoAllWeapons ? ZOMBIE_ESCAPE_WEAPON_CATALOG.length - 1 : selectedIndex
    for (let weaponIndex = firstWeaponIndex; weaponIndex <= lastWeaponIndex; weaponIndex += 1) {
      const segmentIndex = autoAllWeapons ? weaponIndex : 0
      const segmentStart = cycleStart + segmentIndex * ZOMBIE_SHOOTING_DEBUG_SEGMENT_SECONDS
      for (const shotTime of ZOMBIE_SHOOTING_DEBUG_SHOT_TIMES_SECONDS) {
        const absoluteShotTime = segmentStart + shotTime
        visitEventInRange(start, end, absoluteShotTime, weaponIndex, 'shot', visitor)
        visitEventInRange(
          start,
          end,
          absoluteShotTime + ZOMBIE_SHOOTING_DEBUG_PROJECTILE_TRAVEL_SECONDS,
          weaponIndex,
          'impact',
          visitor,
        )
      }
    }
  }
}

function visitEventInRange(
  start: number,
  end: number,
  timeSeconds: number,
  weaponIndex: number,
  kind: ZombieShootingDebugSequenceEvent['kind'],
  visitor: (event: ZombieShootingDebugSequenceEvent) => void,
) {
  if (timeSeconds <= start || timeSeconds > end) return
  visitor({ kind, timeSeconds, weaponIndex })
}

function clampWeaponIndex(index: number) {
  return Math.max(0, Math.min(ZOMBIE_ESCAPE_WEAPON_CATALOG.length - 1, Math.trunc(index) || 0))
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor
}
