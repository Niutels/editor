import { describe, expect, test } from 'bun:test'
import type { MultiplayerPlayerSnapshot } from '@landrush/protocol'
import {
  reconcileRemotePresentationTimeline,
  resolveRemotePresentationSnapshot,
} from './multiplayer-presentation'

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
