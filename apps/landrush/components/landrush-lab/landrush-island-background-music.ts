export type LandrushBackgroundMusicMode = 'day' | 'zombie'

export type LandrushBackgroundMusicTrack = {
  id: string
  mixGain: number
  src: string
  title: string
}

export type LandrushBackgroundMusicPlaybackState = {
  dayTrackIndex: number
  dayTrackQueue: readonly number[]
  mode: LandrushBackgroundMusicMode
}

export const LANDRUSH_DAY_BACKGROUND_MUSIC_TRACKS = [
  {
    id: 'shoreline-clamp',
    mixGain: 1,
    src: '/audios/music/landrush/day/shoreline-clamp.mp3',
    title: 'Shoreline Clamp',
  },
  {
    id: 'daylight-drift',
    mixGain: 1,
    src: '/audios/music/landrush/day/daylight-drift.mp3',
    title: 'Daylight Drift',
  },
  {
    id: 'lydian-drift-loop',
    mixGain: 1,
    src: '/audios/music/landrush/day/lydian-drift-loop.mp3',
    title: 'Lydian Drift Loop',
  },
] as const satisfies readonly LandrushBackgroundMusicTrack[]

export const LANDRUSH_ZOMBIE_BACKGROUND_MUSIC_TRACK = {
  id: 'salted-harbor',
  mixGain: 3,
  src: '/audios/music/landrush/zombie/salted-harbor.mp3',
  title: 'Salted Harbor',
} as const satisfies LandrushBackgroundMusicTrack

export const LANDRUSH_BACKGROUND_MUSIC_FADE_IN_MS = 2_000
export const LANDRUSH_BACKGROUND_MUSIC_FADE_OUT_MS = 3_000

export function resolveLandrushBackgroundMusicMode(
  zombieEscapePhase: string | null,
): LandrushBackgroundMusicMode {
  return zombieEscapePhase === 'night' ? 'zombie' : 'day'
}

export function createLandrushBackgroundMusicPlaybackState(
  random: () => number = Math.random,
): LandrushBackgroundMusicPlaybackState {
  const order = resolveLandrushDayTrackOrder(random)
  return {
    dayTrackIndex: order[0] ?? 0,
    dayTrackQueue: order.slice(1),
    mode: 'day',
  }
}

export function resolveLandrushDayTrackOrder(
  random: () => number,
  previousTrackIndex: number | null = null,
) {
  const order = LANDRUSH_DAY_BACKGROUND_MUSIC_TRACKS.map((_, index) => index)
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(normalizeRandomSample(random()) * (index + 1))
    const current = order[index]!
    order[index] = order[swapIndex]!
    order[swapIndex] = current
  }
  if (order.length > 1 && order[0] === previousTrackIndex) {
    const first = order[0]!
    order[0] = order[1]!
    order[1] = first
  }
  return order
}

export function advanceLandrushDayBackgroundMusicTrack(
  state: LandrushBackgroundMusicPlaybackState,
  random: () => number = Math.random,
): LandrushBackgroundMusicPlaybackState {
  if (state.mode !== 'day') return state
  const queuedTrackIndex = state.dayTrackQueue[0]
  if (queuedTrackIndex !== undefined) {
    return {
      ...state,
      dayTrackIndex: queuedTrackIndex,
      dayTrackQueue: state.dayTrackQueue.slice(1),
    }
  }
  const order = resolveLandrushDayTrackOrder(random, state.dayTrackIndex)
  return {
    ...state,
    dayTrackIndex: order[0] ?? state.dayTrackIndex,
    dayTrackQueue: order.slice(1),
  }
}

export function transitionLandrushBackgroundMusicMode(
  state: LandrushBackgroundMusicPlaybackState,
  mode: LandrushBackgroundMusicMode,
  random: () => number = Math.random,
): LandrushBackgroundMusicPlaybackState {
  if (state.mode === mode) return state
  if (state.mode === 'zombie' && mode === 'day') {
    return advanceLandrushDayBackgroundMusicTrack({ ...state, mode: 'day' }, random)
  }
  return {
    ...state,
    mode,
  }
}

export function resolveLandrushBackgroundMusicFadeEnvelope({
  durationMs,
  elapsedMs,
  from,
  to,
}: {
  durationMs: number
  elapsedMs: number
  from: number
  to: number
}) {
  const progress =
    durationMs <= 0 ? 1 : Math.min(1, Math.max(0, normalizeFinite(elapsedMs) / durationMs))
  const easedProgress = progress * progress * (3 - 2 * progress)
  return from + (to - from) * easedProgress
}

export function resolveLandrushBackgroundMusicTrackFadeOutMs({
  currentTime,
  duration,
}: {
  currentTime: number
  duration: number
}) {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return null
  const remainingMs = Math.max(0, (duration - currentTime) * 1_000)
  if (remainingMs <= 0 || remainingMs > LANDRUSH_BACKGROUND_MUSIC_FADE_OUT_MS) return null
  return remainingMs
}

export function resolveLandrushBackgroundMusicVolume({
  masterVolume,
  mixGain,
  muted,
  radioVolume,
}: {
  masterVolume: number
  mixGain: number
  muted: boolean
  radioVolume: number
}) {
  if (muted) return 0
  return Math.min(
    1,
    normalizeVolumePercent(masterVolume) *
      normalizeVolumePercent(radioVolume) *
      normalizeMixGain(mixGain),
  )
}

export function isLandrushLoadingShellHandedOff(
  shell: { hidden: boolean | string; style: { display: string } } | null,
) {
  return (
    shell === null || Boolean(shell.hidden) || shell.style.display.trim().toLowerCase() === 'none'
  )
}

export function resolveLandrushBackgroundMusicPreloadSource({
  loadingHandedOff,
  trackSource,
}: {
  loadingHandedOff: boolean
  trackSource: string
}) {
  return loadingHandedOff ? trackSource : undefined
}

function normalizeVolumePercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value)) / 100
}

function normalizeMixGain(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, value)
}

function normalizeRandomSample(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1 - Number.EPSILON, Math.max(0, value))
}

function normalizeFinite(value: number) {
  return Number.isFinite(value) ? value : 0
}
