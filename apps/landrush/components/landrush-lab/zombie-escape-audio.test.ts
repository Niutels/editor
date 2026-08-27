import { describe, expect, test } from 'bun:test'
import {
  commitZombieEscapePresenceAudioStart,
  createZombieEscapeAudioLoadState,
  createZombieEscapeAudioSoundOptions,
  createZombieEscapePresenceAudioSchedule,
  resetZombieEscapePresenceAudioSchedule,
  resolveZombieEscapeAudioEventCursor,
  resolveZombieEscapeAudioListenerTransform,
  resolveZombieEscapeAudioSpatialMix,
  resolveZombieEscapePresenceAudioSpatialMix,
  resolveZombieEscapePresenceScheduleDelay,
  resolveZombieEscapePresenceVariation,
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
      ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE.playback,
    )

    expect(options.src).toEqual([ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE.files[0]])
    expect(options.pool).toBe(ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE.playback.maxVoices)
    expect(options.distanceModel).toBe('inverse')
    expect(options.panningModel).toBe('HRTF')
    expect(options.refDistance).toBe(
      ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE.playback.referenceDistance,
    )
    expect(options.rolloffFactor).toBe(0)
    expect(loadState.failed).toBe(false)
    options.onloaderror()
    expect(loadState.failed).toBe(true)
  })
})

describe('Zombie Escape spatial audio mix', () => {
  test('pans in camera-right space with audible inverse-distance rolloff', () => {
    const output: ZombieEscapeAudioSpatialMix = { gain: 0, pan: 0 }

    expect(resolveZombieEscapeAudioSpatialMix(4, 0, 0, 1, 0, 0, 4, 20, output)).toBe(output)
    expect(output).toEqual({ gain: 1, pan: 1 })

    resolveZombieEscapeAudioSpatialMix(-12, 0, 0, 1, 0, 0, 4, 20, output)
    expect(output.pan).toBe(-1)
    expect(output.gain).toBeCloseTo(0.454_545, 6)

    resolveZombieEscapeAudioSpatialMix(18, 0, 0, 1, 0, 0, 4, 20, output)
    expect(output.gain).toBeCloseTo(0.161_29, 5)

    resolveZombieEscapeAudioSpatialMix(20, 0, 0, 1, 0, 0, 4, 20, output)
    expect(output).toEqual({ gain: 0, pan: 0 })
  })

  test('anchors hearing distance at the player while retaining camera orientation', () => {
    const source = createPresenceSource(1)
    source.player.x = 2
    source.player.y = 1
    source.player.z = -3
    const cameraElements = [1, 0, 0, 0, 0, 0.8, -0.6, 0, 0, 0.6, 0.8, 0, 18, 14, 18, 1]
    const output = Array.from({ length: 16 }, () => 0)

    expect(
      resolveZombieEscapeAudioListenerTransform(source, 100, 4, 200, cameraElements, output),
    ).toBe(output)
    expect(output.slice(0, 12)).toEqual(cameraElements.slice(0, 12))
    expect(output.slice(12, 15)).toEqual([102, 5, 197])
  })

  test('uses listener-relative distance and horizontal camera-right panning for presence', () => {
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
        source.player.x,
        source.player.y,
        source.player.z,
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
      source.player.x,
      source.player.y,
      source.player.z,
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
        source.player.x,
        source.player.y,
        source.player.z,
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
      source.player.x,
      source.player.y,
      source.player.z,
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
        source.player.x,
        source.player.y,
        source.player.z,
        owners,
        ownerGenerations,
      ),
    ).toBe(-1)
    expect(schedule.observedGeneration[0]).toBe(99)
    expect(schedule.utteranceOrdinal[0]).toBe(0)
    expect(schedule.nextEligibleAt[0]).toBeGreaterThanOrEqual(20.35)
  })

  test('admits presence using the supplied gameplay listener position', () => {
    const source = createPresenceSource(1)
    const schedule = createZombieEscapePresenceAudioSchedule(1)
    const owners = new Int16Array(1)
    owners.fill(-1)
    const ownerGenerations = new Uint32Array(1)
    source.player.x = 100

    selectZombieEscapePresenceAudioCandidate(
      schedule,
      source,
      ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
      0,
      0,
      0,
      owners,
      ownerGenerations,
    )
    expect(schedule.audible[0]).toBe(1)

    selectZombieEscapePresenceAudioCandidate(
      schedule,
      source,
      ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
      100,
      0,
      0,
      owners,
      ownerGenerations,
    )
    expect(schedule.audible[0]).toBe(0)
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
      source.player.x,
      source.player.y,
      source.player.z,
      owners,
      ownerGenerations,
    )
    expect(schedule.audible[0]).toBe(1)

    source.zombies.x[0] = 31
    selectZombieEscapePresenceAudioCandidate(
      schedule,
      source,
      ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
      source.player.x,
      source.player.y,
      source.player.z,
      owners,
      ownerGenerations,
    )
    expect(schedule.audible[0]).toBe(1)

    source.zombies.x[0] = 32
    selectZombieEscapePresenceAudioCandidate(
      schedule,
      source,
      ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
      source.player.x,
      source.player.y,
      source.player.z,
      owners,
      ownerGenerations,
    )
    expect(schedule.audible[0]).toBe(0)

    source.zombies.health[0] = 0
    selectZombieEscapePresenceAudioCandidate(
      schedule,
      source,
      ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
      source.player.x,
      source.player.y,
      source.player.z,
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

  test('cycles each zombie through all three presence variants without immediate repeats', () => {
    const sequence = Array.from({ length: 6 }, (_, ordinal) =>
      resolveZombieEscapePresenceVariation(91_337, 3, 17, ordinal, 3),
    )

    expect(new Set(sequence.slice(0, 3))).toEqual(new Set([0, 1, 2]))
    expect(sequence.slice(3)).toEqual(sequence.slice(0, 3))
    for (let index = 1; index < sequence.length; index += 1) {
      expect(sequence[index]).not.toBe(sequence[index - 1])
    }
  })
})
