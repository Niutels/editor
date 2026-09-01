export const LANDRUSH_AUDIO_UNMUTE_MIGRATION_STORAGE_KEY = 'landrush-audio-unmute-v1'

type LandrushAudioPreferenceStore = {
  getState: () => { muted: boolean }
  setState: (state: { muted: boolean }) => void
}

type LandrushAudioPreferenceStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function applyLandrushInitialAudioPreference(
  storage: LandrushAudioPreferenceStorage,
  store: LandrushAudioPreferenceStore,
) {
  let migrated = false
  try {
    migrated = storage.getItem(LANDRUSH_AUDIO_UNMUTE_MIGRATION_STORAGE_KEY) === '1'
  } catch {}

  if (migrated) return store.getState().muted

  if (store.getState().muted) store.setState({ muted: false })
  try {
    storage.setItem(LANDRUSH_AUDIO_UNMUTE_MIGRATION_STORAGE_KEY, '1')
  } catch {}
  return false
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
