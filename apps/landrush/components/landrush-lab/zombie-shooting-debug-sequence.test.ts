import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from '@landrush/zombie-gameplay/zombie-escape-weapon-catalog'
import {
  resolveZombieShootingDebugSegmentTime,
  resolveZombieShootingDebugWeaponIndex,
  visitZombieShootingDebugSequenceEvents,
  ZOMBIE_SHOOTING_DEBUG_AUTO_SEQUENCE_SECONDS,
  ZOMBIE_SHOOTING_DEBUG_PROJECTILE_TRAVEL_SECONDS,
  ZOMBIE_SHOOTING_DEBUG_SEGMENT_SECONDS,
  ZOMBIE_SHOOTING_DEBUG_SHOT_TIMES_SECONDS,
  type ZombieShootingDebugSequenceEvent,
} from './zombie-shooting-debug-sequence'

describe('Zombie shooting debug sequence', () => {
  test('allocates one deterministic segment to every production weapon', () => {
    for (let index = 0; index < ZOMBIE_ESCAPE_WEAPON_CATALOG.length; index += 1) {
      expect(
        resolveZombieShootingDebugWeaponIndex(
          index * ZOMBIE_SHOOTING_DEBUG_SEGMENT_SECONDS + 0.5,
          true,
          0,
        ),
      ).toBe(index)
    }
    expect(resolveZombieShootingDebugWeaponIndex(2, false, 4)).toBe(4)
    expect(
      resolveZombieShootingDebugSegmentTime(ZOMBIE_SHOOTING_DEBUG_SEGMENT_SECONDS + 0.4),
    ).toBeCloseTo(0.4, 8)
  })

  test('emits exactly one shot and impact edge per scheduled hit for all weapons', () => {
    const events: ZombieShootingDebugSequenceEvent[] = []
    visitZombieShootingDebugSequenceEvents(
      0,
      ZOMBIE_SHOOTING_DEBUG_AUTO_SEQUENCE_SECONDS,
      true,
      0,
      (event) => events.push(event),
    )

    expect(events).toHaveLength(
      ZOMBIE_ESCAPE_WEAPON_CATALOG.length * ZOMBIE_SHOOTING_DEBUG_SHOT_TIMES_SECONDS.length * 2,
    )
    for (let weaponIndex = 0; weaponIndex < ZOMBIE_ESCAPE_WEAPON_CATALOG.length; weaponIndex += 1) {
      expect(
        events.filter((event) => event.weaponIndex === weaponIndex && event.kind === 'shot'),
      ).toHaveLength(ZOMBIE_SHOOTING_DEBUG_SHOT_TIMES_SECONDS.length)
      expect(
        events.filter((event) => event.weaponIndex === weaponIndex && event.kind === 'impact'),
      ).toHaveLength(ZOMBIE_SHOOTING_DEBUG_SHOT_TIMES_SECONDS.length)
    }
    const firstShot = events[0]
    const firstImpact = events[1]
    expect(firstShot?.kind).toBe('shot')
    expect(firstImpact?.kind).toBe('impact')
    expect((firstImpact?.timeSeconds ?? 0) - (firstShot?.timeSeconds ?? 0)).toBeCloseTo(
      ZOMBIE_SHOOTING_DEBUG_PROJECTILE_TRAVEL_SECONDS,
      8,
    )
  })

  test('is partition-independent across a loop boundary without replaying edges', () => {
    const start = ZOMBIE_SHOOTING_DEBUG_AUTO_SEQUENCE_SECONDS - 0.1
    const end = ZOMBIE_SHOOTING_DEBUG_AUTO_SEQUENCE_SECONDS + 2.2
    const direct: ZombieShootingDebugSequenceEvent[] = []
    const partitioned: ZombieShootingDebugSequenceEvent[] = []
    visitZombieShootingDebugSequenceEvents(start, end, true, 0, (event) => direct.push(event))

    let cursor = start
    while (cursor < end) {
      const next = Math.min(end, cursor + 0.017)
      visitZombieShootingDebugSequenceEvents(cursor, next, true, 0, (event) =>
        partitioned.push(event),
      )
      cursor = next
    }

    expect(partitioned).toEqual(direct)
    expect(direct.map((event) => event.kind)).toEqual(['shot', 'impact', 'shot', 'impact'])
    expect(direct.every((event) => event.weaponIndex === 0)).toBe(true)
  })

  test('manual mode emits only the selected weapon allocation', () => {
    const events: ZombieShootingDebugSequenceEvent[] = []
    visitZombieShootingDebugSequenceEvents(
      0,
      ZOMBIE_SHOOTING_DEBUG_SEGMENT_SECONDS,
      false,
      3,
      (event) => events.push(event),
    )
    expect(events.every((event) => event.weaponIndex === 3)).toBe(true)
  })

  test('resets timeline and audio edge cursors before the next animation frame', () => {
    const source = readFileSync(join(import.meta.dir, 'zombie-shooting-debug-client.tsx'), 'utf8')
    const timelineClock = source.slice(
      source.indexOf('function TimelineClock'),
      source.indexOf('function SequenceDirector'),
    )
    const combatAudioEvents = source.slice(
      source.indexOf('function DebugCombatAudioEvents'),
      source.indexOf('function TrajectoryGuide'),
    )

    expect(timelineClock).toContain('useLayoutEffect(() => {')
    expect(timelineClock).not.toContain('useEffect(() => {')
    expect(combatAudioEvents).toContain('useLayoutEffect(() => {')
    expect(combatAudioEvents).not.toContain('useEffect(() => {')
  })
})
