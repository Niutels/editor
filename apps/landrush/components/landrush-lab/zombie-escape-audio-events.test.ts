import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeAudioEventRing,
  emitZombieEscapeAudioEvent,
  visitZombieEscapeAudioEventsAfter,
  ZOMBIE_ESCAPE_AUDIO_EVENT_KIND,
} from '@landrush/zombie-gameplay/zombie-escape-audio-events'

describe('Zombie Escape audio event ring', () => {
  test('publishes monotonic semantic events without replacing backing storage', () => {
    const events = createZombieEscapeAudioEventRing(3)
    const kinds = events.kind
    const sequences = events.sequence
    const subjectIndices = events.subjectIndex

    expect(
      emitZombieEscapeAudioEvent(events, ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.shotFired, 1, 2, 3, 2),
    ).toBe(1)
    expect(
      emitZombieEscapeAudioEvent(events, ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.enemyHit, 5, 6, 7, 4_096),
    ).toBe(2)

    expect(events.kind).toBe(kinds)
    expect(events.sequence).toBe(sequences)
    expect(events.subjectIndex).toBe(subjectIndices)
    expect(events.subjectIndex).toBeInstanceOf(Uint16Array)
    expect(events.writeSequence).toBe(2)
    expect(events.kind[1]).toBe(ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.enemyHit)
    expect(events.subjectIndex[1]).toBe(4_096)
    expect(events.x[1]).toBe(5)
    expect(events.y[1]).toBe(6)
    expect(events.z[1]).toBe(7)
  })

  test('visits every available event exactly once and skips overwritten history', () => {
    const events = createZombieEscapeAudioEventRing(3)
    for (let index = 0; index < 5; index += 1) {
      emitZombieEscapeAudioEvent(
        events,
        ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.shotFired,
        index,
        0,
        0,
        index,
      )
    }

    const visited: Array<readonly [number, number]> = []
    const cursor = visitZombieEscapeAudioEventsAfter(events, 0, (ring, slot) => {
      visited.push([ring.sequence[slot]!, ring.subjectIndex[slot]!])
    })

    expect(cursor).toBe(5)
    expect(visited).toEqual([
      [3, 2],
      [4, 3],
      [5, 4],
    ])
    expect(
      visitZombieEscapeAudioEventsAfter(events, cursor, () => {
        throw new Error('already-consumed events must not replay')
      }),
    ).toBe(cursor)
  })
})
