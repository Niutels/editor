import { describe, expect, test } from 'bun:test'
import {
  applyLandrushInitialAudioPreference,
  LANDRUSH_AUDIO_SETTINGS_STORAGE_KEY,
  resolveLandrushInitialMutedPreference,
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
  test('keeps a fresh profile silent without activating audio after interaction', () => {
    const audio = createAudioStore(false)
    const reads: string[] = []
    const muted = applyLandrushInitialAudioPreference(
      {
        getItem: (key) => {
          reads.push(key)
          return null
        },
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

    expect(reads).toEqual([LANDRUSH_AUDIO_SETTINGS_STORAGE_KEY])
    expect(muted).toBe(true)
    expect(audio.muted).toBe(true)
    expect(audio.writes).toEqual([true])
    expect(graphAllocations).toBe(0)
    expect(playbackActivations).toBe(0)
  })

  test('preserves an existing explicit unmuted preference', () => {
    const audio = createAudioStore(false)
    const muted = applyLandrushInitialAudioPreference(
      {
        getItem: () => JSON.stringify({ state: { muted: false } }),
      },
      audio.store,
    )

    expect(muted).toBe(false)
    expect(audio.muted).toBe(false)
    expect(audio.writes).toEqual([])
    expect(
      shouldActivateLandrushGameplayAudio({
        enabled: true,
        masterVolume: 70,
        muted: audio.muted,
        sfxVolume: 50,
      }),
    ).toBe(true)
  })

  test('fails closed for malformed, incomplete, or unavailable persistence', () => {
    expect(resolveLandrushInitialMutedPreference('{')).toBe(true)
    expect(resolveLandrushInitialMutedPreference(JSON.stringify({ state: {} }))).toBe(true)

    const audio = createAudioStore(false)
    expect(
      applyLandrushInitialAudioPreference(
        {
          getItem: () => {
            throw new Error('storage unavailable')
          },
        },
        audio.store,
      ),
    ).toBe(true)
    expect(audio.muted).toBe(true)
  })
})
