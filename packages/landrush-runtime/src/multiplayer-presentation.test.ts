import { describe, expect, test } from 'bun:test'
import type { MultiplayerPlayerCombatSnapshot, MultiplayerPlayerSnapshot } from '@landrush/protocol'
import {
  reconcileRemotePresentationTimeline,
  resolveRemotePresentationSnapshot,
} from './multiplayer-presentation'
import { remotePlayerRosterChanged, shouldSendPlayerSnapshot } from './world-multiplayer-client'

function snapshot(
  updatedAt: number,
  pose?: MultiplayerPlayerSnapshot['pose'],
): MultiplayerPlayerSnapshot {
  return {
    color: '#7dd3fc',
    heading: 0,
    id: 'remote-player',
    moving: false,
    name: 'Remote',
    pose,
    position: [updatedAt / 1_000, 0, 0],
    speed: 1,
    updatedAt,
  }
}

describe('remote multiplayer presentation pose', () => {
  test('carries crouching through the interpolated snapshot without blending invalid poses', () => {
    const first = reconcileRemotePresentationTimeline(null, snapshot(1_000), 1_000, 1_000)
    const second = reconcileRemotePresentationTimeline(
      first.timeline,
      snapshot(1_100, 'crouching'),
      1_100,
      1_100,
    )

    expect(resolveRemotePresentationSnapshot(second.timeline, 1_170)?.pose).toBe('crouching')
  })

  test('preserves falling as a distinct higher-priority wire pose', () => {
    const result = reconcileRemotePresentationTimeline(
      null,
      snapshot(1_000, 'falling'),
      1_000,
      1_000,
    )

    expect(resolveRemotePresentationSnapshot(result.timeline, 1_000)?.pose).toBe('falling')
  })
})

function combat(
  overrides: Partial<MultiplayerPlayerCombatSnapshot> = {},
): MultiplayerPlayerCombatSnapshot {
  return {
    aimAngle: 0,
    ammo: 60,
    meleePhase: 'idle',
    meleeProgress: 0,
    shotSequence: 0,
    shots: [],
    weaponIndex: 0,
    ...overrides,
  }
}

function armedSnapshot(
  overrides: Partial<MultiplayerPlayerCombatSnapshot> = {},
): MultiplayerPlayerSnapshot {
  return { ...snapshot(1_000), position: [0, 0, 0], speed: 0, combat: combat(overrides) }
}

describe('remote multiplayer combat presentation', () => {
  test('publishes combat changes while stationary without waiting for the idle heartbeat', () => {
    const previous = armedSnapshot()
    expect(shouldSendPlayerSnapshot(armedSnapshot(), previous, 80)).toBe(false)
    for (const change of [
      { aimAngle: 0.3 },
      { ammo: 59 },
      { weaponIndex: 2 },
      { shotSequence: 1 },
      { meleePhase: 'windup' as const },
      { meleeProgress: 0.4 },
    ]) {
      expect(shouldSendPlayerSnapshot(armedSnapshot(change), previous, 80)).toBe(true)
    }
    expect(shouldSendPlayerSnapshot({ ...previous, combat: undefined }, previous, 80)).toBe(true)
    expect(shouldSendPlayerSnapshot(previous, { ...previous, combat: undefined }, 80)).toBe(true)
    expect(shouldSendPlayerSnapshot(armedSnapshot(), previous, 2_000)).toBe(true)
  })

  test('keeps projectile travel and expiry publishing after the trigger is released', () => {
    const first = armedSnapshot({
      shotSequence: 1,
      shots: [
        {
          id: 8,
          impactAge: null,
          position: [1, 2, 3],
          previousPosition: [0, 2, 3],
          weaponIndex: 0,
        },
      ],
    })
    const moved = structuredClone(first)
    moved.combat!.shots[0]!.position[0] = 2
    expect(shouldSendPlayerSnapshot(moved, first, 80)).toBe(true)
    const expired = { ...first, combat: { ...first.combat!, shots: [] } }
    expect(shouldSendPlayerSnapshot(expired, first, 80)).toBe(true)
  })

  test('mounts combat on phase changes without rebuilding the roster for each shot or aim update', () => {
    const first = armedSnapshot()
    expect(
      remotePlayerRosterChanged(
        first,
        armedSnapshot({ ammo: 59, aimAngle: 0.5, shotSequence: 1, weaponIndex: 1 }),
      ),
    ).toBe(false)
    expect(remotePlayerRosterChanged(first, { ...first, combat: undefined })).toBe(true)
    expect(remotePlayerRosterChanged({ ...first, combat: undefined }, first)).toBe(true)
  })

  test('interpolates aim and matching projectiles while keeping inventory and melee phases discrete', () => {
    const first = armedSnapshot({
      aimAngle: (Math.PI * 170) / 180,
      shotSequence: 1,
      shots: [
        {
          id: 8,
          impactAge: null,
          position: [0, 2, 3],
          previousPosition: [-1, 2, 3],
          weaponIndex: 0,
        },
      ],
    })
    const second: MultiplayerPlayerSnapshot = {
      ...first,
      updatedAt: 1_100,
      combat: combat({
        aimAngle: (-Math.PI * 170) / 180,
        ammo: 0,
        meleePhase: 'windup',
        meleeProgress: 0.4,
        shotSequence: 1,
        shots: [
          {
            id: 8,
            impactAge: null,
            position: [4, 2, 3],
            previousPosition: [3, 2, 3],
            weaponIndex: 0,
          },
        ],
        weaponIndex: 2,
      }),
    }
    const timeline = reconcileRemotePresentationTimeline(null, first, 1_000, 1_000).timeline
    const next = reconcileRemotePresentationTimeline(timeline, second, 1_100, 1_100)
    const presented = resolveRemotePresentationSnapshot(next.timeline, 1_170)!
    expect(Math.abs(presented.combat!.aimAngle)).toBeCloseTo(Math.PI)
    expect(presented.combat!.shots[0]!.position).toEqual([2, 2, 3])
    expect(presented.combat!.shots[0]!.previousPosition).toEqual([1, 2, 3])
    expect(presented.combat!.ammo).toBe(0)
    expect(presented.combat!.weaponIndex).toBe(2)
    expect(presented.combat!.meleePhase).toBe('windup')
    expect(presented.combat!.meleeProgress).toBe(0.4)
    expect(first.combat!.shots[0]!.position).toEqual([0, 2, 3])
  })

  test('does not revive a weapon or old projectile history when leaving combat or restarting', () => {
    const first = armedSnapshot({ shotSequence: 10, ammo: 5 })
    const start = reconcileRemotePresentationTimeline(null, first, 1_000, 1_000)
    for (const combatState of [undefined, combat()]) {
      const second = { ...first, updatedAt: 1_100, combat: combatState }
      const next = reconcileRemotePresentationTimeline(start.timeline, second, 1_100, 1_100)
      expect(resolveRemotePresentationSnapshot(next.timeline, 1_170)!.combat).toEqual(combatState)
    }
  })
})
