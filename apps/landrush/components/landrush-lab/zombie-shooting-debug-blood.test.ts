import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ZombieEscapeBloodEvent } from './zombie-escape-blood-effects'
import {
  shouldRenderZombieShootingDebugContactMarker,
  writeZombieShootingDebugBloodEvent,
} from './zombie-shooting-debug-blood'
import {
  visitZombieShootingDebugSequenceEvents,
  ZOMBIE_SHOOTING_DEBUG_PROJECTILE_TRAVEL_SECONDS,
  ZOMBIE_SHOOTING_DEBUG_SHOT_TIMES_SECONDS,
  type ZombieShootingDebugSequenceEvent,
} from './zombie-shooting-debug-sequence'

function createEventScratch(): ZombieEscapeBloodEvent {
  return {
    directionX: 0,
    directionY: 0,
    directionZ: 0,
    normalX: 0,
    normalY: 0,
    normalZ: 0,
    originX: 0,
    originY: 0,
    originZ: 0,
    seed: 0,
    spawnElapsedSeconds: 0,
    targetGeneration: 0,
    targetSlot: -1,
  }
}

function collectBloodEvents(partitions: readonly [number, number][]) {
  const output: ZombieEscapeBloodEvent[] = []
  const scratch = createEventScratch()
  for (const [start, end] of partitions) {
    visitZombieShootingDebugSequenceEvents(start, end, false, 2, (event) => {
      if (!writeZombieShootingDebugBloodEvent(event, scratch)) return
      output.push({ ...scratch })
    })
  }
  return output
}

describe('Zombie shooting debug blood proof', () => {
  test('uses absolute impact time and is partition-independent', () => {
    const firstImpact =
      ZOMBIE_SHOOTING_DEBUG_SHOT_TIMES_SECONDS[0] + ZOMBIE_SHOOTING_DEBUG_PROJECTILE_TRAVEL_SECONDS
    const direct = collectBloodEvents([[0, firstImpact + 0.14]])
    const partitioned = collectBloodEvents([
      [0, 0.4],
      [0.4, 0.8],
      [0.8, firstImpact + 0.14],
    ])

    expect(partitioned).toEqual(direct)
    expect(direct).toHaveLength(1)
    expect(direct[0]?.spawnElapsedSeconds).toBeCloseTo(firstImpact, 8)
    expect(firstImpact + 0.14 - (direct[0]?.spawnElapsedSeconds ?? 0)).toBeCloseTo(0.14, 8)
  })

  test('replays the same deterministic event after a timeline reset', () => {
    const event: ZombieShootingDebugSequenceEvent = {
      kind: 'impact',
      timeSeconds: 0.96,
      weaponIndex: 3,
    }
    const first = createEventScratch()
    const replay = createEventScratch()

    expect(writeZombieShootingDebugBloodEvent(event, first)).toBe(true)
    expect(writeZombieShootingDebugBloodEvent(event, replay)).toBe(true)
    expect(replay).toEqual(first)
    expect(writeZombieShootingDebugBloodEvent({ ...event, kind: 'shot' }, replay)).toBe(false)
  })

  test('keeps contact diagnostics out of final and no-post proof views', () => {
    expect(shouldRenderZombieShootingDebugContactMarker('final')).toBe(false)
    expect(shouldRenderZombieShootingDebugContactMarker('no-post')).toBe(false)
    expect(shouldRenderZombieShootingDebugContactMarker('diagnostic')).toBe(true)
  })

  test('mounts the shared blood renderer without legacy enemy flash or ring pools', () => {
    const source = readFileSync(join(import.meta.dir, 'zombie-shooting-debug-client.tsx'), 'utf8')
    expect(source).toContain('<ZombieEscapeBloodPresentation')
    expect(source).toContain('resolveWorldAttachment={resolveWorldAttachment}')
    expect(source).toContain('captureZombieEscapeSkinnedImpact(')
    expect(source).toContain('data-capture-ready')
    expect(source).toContain('resolveZombieEscapeHitFlickerPhase')
    expect(source).not.toContain('impactFlashRef')
    expect(source).not.toContain('impactRingRef')
    expect(source).not.toContain('ZOMBIE_HIT_COLOR')
  })
})
