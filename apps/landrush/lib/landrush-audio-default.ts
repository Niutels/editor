export const LANDRUSH_AUDIO_SETTINGS_STORAGE_KEY = 'pascal-audio-settings'

type LandrushAudioPreferenceStore = {
  getState: () => { muted: boolean }
  setState: (state: { muted: boolean }) => void
}

type LandrushAudioPreferenceStorage = {
  getItem: (key: string) => string | null
}

export function resolveLandrushInitialMutedPreference(serializedSettings: string | null) {
  if (serializedSettings === null) return true

  try {
    const persisted = JSON.parse(serializedSettings) as { state?: { muted?: unknown } }
    return typeof persisted.state?.muted === 'boolean' ? persisted.state.muted : true
  } catch {
    return true
  }
}

export function applyLandrushInitialAudioPreference(
  storage: LandrushAudioPreferenceStorage,
  store: LandrushAudioPreferenceStore,
) {
  let serializedSettings: string | null = null
  try {
    serializedSettings = storage.getItem(LANDRUSH_AUDIO_SETTINGS_STORAGE_KEY)
  } catch {}

  const muted = resolveLandrushInitialMutedPreference(serializedSettings)
  if (store.getState().muted !== muted) store.setState({ muted })
  return muted
}

export function shouldActivateLandrushGameplayAudio({
  enabled,
  masterVolume,
  muted,
  sfxVolume,
}: {
  enabled: boolean
  masterVolume: number
  muted: boolean
  sfxVolume: number
}) {
  return enabled && !muted && masterVolume > 0 && sfxVolume > 0
}
