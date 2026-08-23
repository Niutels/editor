import { describe, expect, test } from 'bun:test'
import {
  commitZombieEscapePresenceAudioStart,
  createZombieEscapeAudioLoadState,
  createZombieEscapeAudioSoundOptions,
  createZombieEscapePresenceAudioSchedule,
  resetZombieEscapePresenceAudioSchedule,
  resolveZombieEscapeAudioEventCursor,
  resolveZombieEscapeAudioSpatialMix,
  resolveZombieEscapePresenceAudioSpatialMix,
  resolveZombieEscapePresenceScheduleDelay,
  selectZombieEscapePresenceAudioCandidate,
  shouldPlayZombieEscapePresenceAudio,
  type ZombieEscapeAudioSpatialMix,
  type ZombieEscapePresenceAudioSource,
} from './zombie-escape-audio'
import { ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE } from './zombie-escape-audio-catalog'
import {
  createZombieEscapeAudioEventRing,
  emitZombieEscapeAudioEvent,
  visitZombieEscapeAudioEventsAfter,
  ZOMBIE_ESCAPE_AUDIO_EVENT_KIND,
} from './zombie-escape-audio-events'

describe('Zombie Escape audio readiness', () => {
  test('wires presence Howl load errors into the shared runtime failure state', () => {
    const loadState = createZombieEscapeAudioLoadState()
    const options = createZombieEscapeAudioSoundOptions(
      ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE.files[0],
      ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE.playback.maxVoices,
      loadState,
    )

    expect(options.src).toEqual([ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE.files[0]])
    expect(options.pool).toBe(ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE.playback.maxVoices)
    expect(loadState.failed).toBe(false)
    options.onloaderror()
    expect(loadState.failed).toBe(true)
  })
})

describe('Zombie Escape spatial audio mix', () => {
  test('pans in camera-right space and fades smoothly to the bounded distance', () => {
    const output: ZombieEscapeAudioSpatialMix = { gain: 0, pan: 0 }

    expect(resolveZombieEscapeAudioSpatialMix(4, 0, 0, 1, 0, 0, 4, 20, output)).toBe(output)
    expect(output).toEqual({ gain: 1, pan: 1 })

    resolveZombieEscapeAudioSpatialMix(-12, 0, 0, 1, 0, 0, 4, 20, output)
    expect(output.pan).toBe(-1)
    expect(output.gain).toBeCloseTo(0.5, 6)

    resolveZombieEscapeAudioSpatialMix(20, 0, 0, 1, 0, 0, 4, 20, output)
    expect(output).toEqual({ gain: 0, pan: 0 })
  })

  test('uses player-relative distance and horizontal camera-right panning for presence', () => {
    const output: ZombieEscapeAudioSpatialMix = { gain: 0, pan: 0 }

    resolveZombieEscapePresenceAudioSpatialMix(8, 0, 0, 1, 0, 4, 20, output)
    expect(output.pan).toBe(1)
    expect(output.gain).toBeGreaterThan(0)

    resolveZombieEscapePresenceAudioSpatialMix(0, 8, 0, 1, 0, 4, 20, output)
    expect(output.pan).toBe(0)
    expect(output.gain).toBeGreaterThan(0)

    resolveZombieEscapePresenceAudioSpatialMix(0, 0, 8, 0, -2, 4, 20, output)
    expect(output.pan).toBe(-1)
  })
})

describe('Zombie Escape realtime audio cursor', () => {
  test('drops unavailable history and resumes with only newly emitted events', () => {
    const events = createZombieEscapeAudioEventRing()
    let cursor = 0
    for (let index = 0; index < events.capacity; index += 1) {
      emitZombieEscapeAudioEvent(events, ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.enemyHit, index, 0, 0)
    }

    cursor = resolveZombieEscapeAudioEventCursor(cursor, events.writeSequence, false)
    expect(cursor).toBe(events.capacity)
    expect(resolveZombieEscapeAudioEventCursor(cursor, events.writeSequence, true)).toBe(cursor)

    const recoveredEvents: number[] = []
    cursor = visitZombieEscapeAudioEventsAfter(events, cursor, (ring, slot) => {
      recoveredEvents.push(ring.sequence[slot]!)
    })
    expect(recoveredEvents).toEqual([])

    const liveSequence = emitZombieEscapeAudioEvent(
      events,
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.enemyKilled,
      1,
      0,
      0,
    )
    cursor = visitZombieEscapeAudioEventsAfter(events, cursor, (ring, slot) => {
      recoveredEvents.push(ring.sequence[slot]!)
    })

    expect(recoveredEvents).toEqual([liveSequence])
    expect(cursor).toBe(liveSequence)
  })
})

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] }

function createPresenceSource(capacity = 2): Mutable<ZombieEscapePresenceAudioSource> {
  const active = new Uint8Array(capacity)
  const generation = new Uint32Array(capacity)
  const health = new Float32Array(capacity)
  const x = new Float32Array(capacity)
  active.fill(1)
  health.fill(100)
  for (let slot = 0; slot < capacity; slot += 1) {
    generation[slot] = slot + 11
    x[slot] = 4 + slot * 4
  }
  return {
    elapsedSeconds: 0,
    paused: false,
    phase: 'night',
    player: { health: 100, x: 0, y: 0, z: 0 },
    seed: 91_337,
    status: 'playing',
    zombies: {
      health,
      pool: { active, capacity, generation },
      x,
      y: new Float32Array(capacity),
      z: new Float32Array(capacity),
    },
  }
}

describe('Zombie Escape presence audio schedule', () => {
  test('gates presence to live, unpaused night gameplay', () => {
    const source = createPresenceSource()
    expect(shouldPlayZombieEscapePresenceAudio(source)).toBe(true)
    source.paused = true
    expect(shouldPlayZombieEscapePresenceAudio(source)).toBe(false)
    source.paused = false
    source.phase = 'build'
    expect(shouldPlayZombieEscapePresenceAudio(source)).toBe(false)
    source.phase = 'night'
    source.status = 'lost'
    expect(shouldPlayZombieEscapePresenceAudio(source)).toBe(false)
    expect(
      shouldPlayZombieEscapePresenceAudio({
        ...source,
        player: { ...source.player, health: 0 },
        status: 'playing',
      }),
    ).toBe(false)
  })

  test('stages generations deterministically and enforces one global start interval', () => {
    const source = createPresenceSource()
    const schedule = createZombieEscapePresenceAudioSchedule(2)
    const owners = new Int16Array(6)
    owners.fill(-1)
    const ownerGenerations = new Uint32Array(6)

    expect(
      selectZombieEscapePresenceAudioCandidate(
        schedule,
        source,
        ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
        owners,
        ownerGenerations,
      ),
    ).toBe(-1)
    expect(schedule.nextEligibleAt[0]).toBeGreaterThanOrEqual(0.35)
    expect(schedule.nextEligibleAt[0]).toBeLessThanOrEqual(2.8)

    source.elapsedSeconds = Math.min(...schedule.nextEligibleAt) + 0.000_001
    const candidate = selectZombieEscapePresenceAudioCandidate(
      schedule,
      source,
      ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
      owners,
      ownerGenerations,
    )
    expect(candidate).toBeGreaterThanOrEqual(0)
    expect(
      commitZombieEscapePresenceAudioStart(
        schedule,
        source,
        ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
        candidate,
      ),
    ).toBe(true)
    expect(schedule.utteranceOrdinal[candidate]).toBe(1)
    expect(schedule.globalNextStartAt).toBeCloseTo(source.elapsedSeconds + 0.22, 8)
    expect(schedule.nextEligibleAt[candidate]! - source.elapsedSeconds).toBeGreaterThanOrEqual(3.8)
    expect(schedule.nextEligibleAt[candidate]! - source.elapsedSeconds).toBeLessThanOrEqual(7)
    expect(
      selectZombieEscapePresenceAudioCandidate(
        schedule,
        source,
        ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
        owners,
        ownerGenerations,
      ),
    ).toBe(-1)
  })

  test('does not inherit cooldown or ownership across slot reuse', () => {
    const source = createPresenceSource(1)
    const schedule = createZombieEscapePresenceAudioSchedule(1)
    const owners = new Int16Array([0])
    const ownerGenerations = new Uint32Array([source.zombies.pool.generation[0]!])
    selectZombieEscapePresenceAudioCandidate(
      schedule,
      source,
      ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
      owners,
      ownerGenerations,
    )

    source.elapsedSeconds = 20
    source.zombies.pool.generation[0] = 99
    expect(
      selectZombieEscapePresenceAudioCandidate(
        schedule,
        source,
        ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
        owners,
        ownerGenerations,
      ),
    ).toBe(-1)
    expect(schedule.observedGeneration[0]).toBe(99)
    expect(schedule.utteranceOrdinal[0]).toBe(0)
    expect(schedule.nextEligibleAt[0]).toBeGreaterThanOrEqual(20.35)
  })

  test('uses hysteresis at range boundaries and clears dead zombies', () => {
    const source = createPresenceSource(1)
    const schedule = createZombieEscapePresenceAudioSchedule(1)
    const owners = new Int16Array(1)
    owners.fill(-1)
    const ownerGenerations = new Uint32Array(1)
    source.zombies.x[0] = 29
    selectZombieEscapePresenceAudioCandidate(
      schedule,
      source,
      ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
      owners,
      ownerGenerations,
    )
    expect(schedule.audible[0]).toBe(1)

    source.zombies.x[0] = 31
    selectZombieEscapePresenceAudioCandidate(
      schedule,
      source,
      ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
      owners,
      ownerGenerations,
    )
    expect(schedule.audible[0]).toBe(1)

    source.zombies.x[0] = 32
    selectZombieEscapePresenceAudioCandidate(
      schedule,
      source,
      ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
      owners,
      ownerGenerations,
    )
    expect(schedule.audible[0]).toBe(0)

    source.zombies.health[0] = 0
    selectZombieEscapePresenceAudioCandidate(
      schedule,
      source,
      ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
      owners,
      ownerGenerations,
    )
    expect(schedule.audible[0]).toBe(0)

    resetZombieEscapePresenceAudioSchedule(schedule)
    expect(schedule.enabled).toBe(false)
    expect([...schedule.observedGeneration]).toEqual([0])
  })

  test('derives repeatable but generation-sensitive delays without random state', () => {
    const range = [0.35, 2.8] as const
    const first = resolveZombieEscapePresenceScheduleDelay(91_337, 3, 17, 2, 41, range)
    expect(resolveZombieEscapePresenceScheduleDelay(91_337, 3, 17, 2, 41, range)).toBe(first)
    expect(resolveZombieEscapePresenceScheduleDelay(91_337, 3, 18, 2, 41, range)).not.toBe(first)
    expect(first).toBeGreaterThanOrEqual(range[0])
    expect(first).toBeLessThanOrEqual(range[1])
  })
})
