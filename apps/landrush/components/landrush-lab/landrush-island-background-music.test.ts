import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  advanceLandrushDayBackgroundMusicTrack,
  createLandrushBackgroundMusicPlaybackState,
  isLandrushLoadingShellHandedOff,
  LANDRUSH_BACKGROUND_MUSIC_FADE_IN_MS,
  LANDRUSH_BACKGROUND_MUSIC_FADE_OUT_MS,
  LANDRUSH_DAY_BACKGROUND_MUSIC_TRACKS,
  LANDRUSH_ZOMBIE_BACKGROUND_MUSIC_TRACK,
  resolveLandrushBackgroundMusicFadeEnvelope,
  resolveLandrushBackgroundMusicMode,
  resolveLandrushBackgroundMusicTrackFadeOutMs,
  resolveLandrushBackgroundMusicVolume,
  transitionLandrushBackgroundMusicMode,
} from './landrush-island-background-music'

const ASSET_FIXTURES = [
  {
    bytes: 987_191,
    sha256: '751cb4448965aeb77c895ae65b8d20dff7f3a4283e7edff5685edb2538e2f37f',
    track: LANDRUSH_DAY_BACKGROUND_MUSIC_TRACKS[0],
  },
  {
    bytes: 5_255_145,
    sha256: '60beb73db0c6cad5e6082de5a00b0b65c341980750dee66965edfbdf55b0e0a2',
    track: LANDRUSH_DAY_BACKGROUND_MUSIC_TRACKS[1],
  },
  {
    bytes: 4_962_820,
    sha256: 'a81ba7cd13af80cefc352401e2d6df79d4aee2fd69a8a51587e8692bb0f11d50',
    track: LANDRUSH_DAY_BACKGROUND_MUSIC_TRACKS[2],
  },
  {
    bytes: 6_660_568,
    sha256: 'b47fb9544c72c86546d47659dc2f5b7d7ce25bfa6e4b302e9a0f4610bf60be35',
    track: LANDRUSH_ZOMBIE_BACKGROUND_MUSIC_TRACK,
  },
] as const

describe('Landrush island background music', () => {
  test('ships the exact authored MP3 assets', () => {
    for (const fixture of ASSET_FIXTURES) {
      const filePath = resolve(import.meta.dir, '../../public', fixture.track.src.slice(1))
      const bytes = readFileSync(filePath)
      expect(statSync(filePath).size).toBe(fixture.bytes)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256)
    }
  })

  test('ships three day tracks and one separate zombie loop', () => {
    expect(LANDRUSH_DAY_BACKGROUND_MUSIC_TRACKS.map((track) => track.title)).toEqual([
      'Shoreline Clamp',
      'Daylight Drift',
      'Lydian Drift Loop',
    ])
    expect(LANDRUSH_ZOMBIE_BACKGROUND_MUSIC_TRACK.title).toBe('Salted Harbor')
    expect(LANDRUSH_DAY_BACKGROUND_MUSIC_TRACKS.map((track) => track.mixGain)).toEqual([1, 1, 1])
    expect(LANDRUSH_ZOMBIE_BACKGROUND_MUSIC_TRACK.mixGain).toBe(3)
  })

  test('plays a randomized shuffle bag without repeats', () => {
    const initial = createLandrushBackgroundMusicPlaybackState(() => 0)
    const played = [initial.dayTrackIndex]
    let current = initial
    for (let index = 1; index < LANDRUSH_DAY_BACKGROUND_MUSIC_TRACKS.length; index += 1) {
      current = advanceLandrushDayBackgroundMusicTrack(current, () => 0)
      played.push(current.dayTrackIndex)
    }
    expect(initial.dayTrackIndex).toBe(1)
    expect([...played].sort()).toEqual([0, 1, 2])
    expect(new Set(played).size).toBe(LANDRUSH_DAY_BACKGROUND_MUSIC_TRACKS.length)

    const previousTrackIndex = current.dayTrackIndex
    current = advanceLandrushDayBackgroundMusicTrack(current, () => 0)
    expect(current.dayTrackIndex).not.toBe(previousTrackIndex)
  })

  test('takes the next shuffled day track after every zombie phase', () => {
    const day = createLandrushBackgroundMusicPlaybackState(() => 0)
    const zombie = transitionLandrushBackgroundMusicMode(day, 'zombie')
    expect(advanceLandrushDayBackgroundMusicTrack(zombie)).toBe(zombie)
    expect(transitionLandrushBackgroundMusicMode(zombie, 'day')).toEqual({
      dayTrackIndex: 2,
      dayTrackQueue: [0],
      mode: 'day',
    })
  })

  test('uses smooth two-second starts and three-second finishes', () => {
    expect(LANDRUSH_BACKGROUND_MUSIC_FADE_IN_MS).toBe(2_000)
    expect(LANDRUSH_BACKGROUND_MUSIC_FADE_OUT_MS).toBe(3_000)
    expect(
      resolveLandrushBackgroundMusicFadeEnvelope({
        durationMs: 2_000,
        elapsedMs: 0,
        from: 0,
        to: 1,
      }),
    ).toBe(0)
    expect(
      resolveLandrushBackgroundMusicFadeEnvelope({
        durationMs: 2_000,
        elapsedMs: 1_000,
        from: 0,
        to: 1,
      }),
    ).toBe(0.5)
    expect(
      resolveLandrushBackgroundMusicFadeEnvelope({
        durationMs: 2_000,
        elapsedMs: 2_000,
        from: 0,
        to: 1,
      }),
    ).toBe(1)
    expect(
      resolveLandrushBackgroundMusicTrackFadeOutMs({ currentTime: 6, duration: 10 }),
    ).toBeNull()
    expect(resolveLandrushBackgroundMusicTrackFadeOutMs({ currentTime: 7, duration: 10 })).toBe(
      3_000,
    )
    expect(resolveLandrushBackgroundMusicTrackFadeOutMs({ currentTime: 9.5, duration: 10 })).toBe(
      500,
    )
  })

  test('uses actual night phase for zombie music', () => {
    expect(resolveLandrushBackgroundMusicMode('build')).toBe('day')
    expect(resolveLandrushBackgroundMusicMode(null)).toBe('day')
    expect(resolveLandrushBackgroundMusicMode('night')).toBe('zombie')
  })

  test('uses the full range of both existing volume controls', () => {
    expect(
      resolveLandrushBackgroundMusicVolume({
        masterVolume: 70,
        mixGain: LANDRUSH_DAY_BACKGROUND_MUSIC_TRACKS[0].mixGain,
        muted: false,
        radioVolume: 25,
      }),
    ).toBeCloseTo(0.175)
    expect(
      resolveLandrushBackgroundMusicVolume({
        masterVolume: 100,
        mixGain: LANDRUSH_DAY_BACKGROUND_MUSIC_TRACKS[0].mixGain,
        muted: false,
        radioVolume: 100,
      }),
    ).toBe(1)
    expect(
      resolveLandrushBackgroundMusicVolume({
        masterVolume: 100,
        mixGain: LANDRUSH_ZOMBIE_BACKGROUND_MUSIC_TRACK.mixGain,
        muted: true,
        radioVolume: 100,
      }),
    ).toBe(0)
  })

  test('raises Salted Harbor above the busy zombie soundscape without changing day gain', () => {
    expect(
      resolveLandrushBackgroundMusicVolume({
        masterVolume: 70,
        mixGain: LANDRUSH_ZOMBIE_BACKGROUND_MUSIC_TRACK.mixGain,
        muted: false,
        radioVolume: 25,
      }),
    ).toBeCloseTo(0.525)
    expect(
      resolveLandrushBackgroundMusicVolume({
        masterVolume: 100,
        mixGain: LANDRUSH_ZOMBIE_BACKGROUND_MUSIC_TRACK.mixGain,
        muted: false,
        radioVolume: 100,
      }),
    ).toBe(1)
  })

  test('waits for the visible loading shell to hand off', () => {
    expect(isLandrushLoadingShellHandedOff(null)).toBe(true)
    expect(isLandrushLoadingShellHandedOff({ hidden: false, style: { display: '' } })).toBe(false)
    expect(isLandrushLoadingShellHandedOff({ hidden: true, style: { display: '' } })).toBe(true)
    expect(isLandrushLoadingShellHandedOff({ hidden: false, style: { display: 'none' } })).toBe(
      true,
    )
  })
})
