import { describe, expect, test } from 'bun:test'
import {
  applyLandrushInitialAudioPreference,
  LANDRUSH_AUDIO_UNMUTE_MIGRATION_STORAGE_KEY,
  shouldActivateLandrushGameplayAudio,
} from './landrush-audio-default'

function createAudioStore(initialMuted: boolean) {
  let muted = initialMuted
  const writes: boolean[] = []
  return {
    get muted() {
      return muted
    },
    store: {
      getState: () => ({ muted }),
      setState: (state: { muted: boolean }) => {
        muted = state.muted
        writes.push(state.muted)
      },
    },
    writes,
  }
}

describe('Landrush initial audio preference', () => {
  test('keeps a fresh profile unmuted without a redundant audio-store write', () => {
    const audio = createAudioStore(false)
    const migrationWrites: Array<[string, string]> = []

    expect(
      applyLandrushInitialAudioPreference(
        {
          getItem: () => null,
          setItem: (key, value) => migrationWrites.push([key, value]),
        },
        audio.store,
      ),
    ).toBe(false)
    expect(audio.muted).toBe(false)
    expect(audio.writes).toEqual([])
    expect(migrationWrites).toEqual([[LANDRUSH_AUDIO_UNMUTE_MIGRATION_STORAGE_KEY, '1']])
  })

  test('unmutes an existing profile once and activates audio after interaction', () => {
    const audio = createAudioStore(true)
    const reads: string[] = []
    const writes: Array<[string, string]> = []
    const muted = applyLandrushInitialAudioPreference(
      {
        getItem: (key) => {
          reads.push(key)
          return null
        },
        setItem: (key, value) => writes.push([key, value]),
      },
      audio.store,
    )

    let graphAllocations = 0
    let playbackActivations = 0
    const userInteracted = true
    if (
      userInteracted &&
      shouldActivateLandrushGameplayAudio({
        enabled: true,
        masterVolume: 70,
        muted: audio.muted,
        sfxVolume: 50,
      })
    ) {
      graphAllocations += 1
      playbackActivations += 1
    }

    expect(reads).toEqual([LANDRUSH_AUDIO_UNMUTE_MIGRATION_STORAGE_KEY])
    expect(writes).toEqual([[LANDRUSH_AUDIO_UNMUTE_MIGRATION_STORAGE_KEY, '1']])
    expect(muted).toBe(false)
    expect(audio.muted).toBe(false)
    expect(audio.writes).toEqual([false])
    expect(graphAllocations).toBe(1)
    expect(playbackActivations).toBe(1)
  })

  test('preserves a preference after the unmute migration has run', () => {
    const audio = createAudioStore(true)
    const muted = applyLandrushInitialAudioPreference(
      {
        getItem: () => '1',
        setItem: () => {
          throw new Error('migration must not be rewritten')
        },
      },
      audio.store,
    )

    expect(muted).toBe(true)
    expect(audio.muted).toBe(true)
    expect(audio.writes).toEqual([])
  })

  test('unmutes in memory when migration storage is unavailable', () => {
    const audio = createAudioStore(true)
    expect(
      applyLandrushInitialAudioPreference(
        {
          getItem: () => {
            throw new Error('storage unavailable')
          },
          setItem: () => {
            throw new Error('storage unavailable')
          },
        },
        audio.store,
      ),
    ).toBe(false)
    expect(audio.muted).toBe(false)
  })
})
