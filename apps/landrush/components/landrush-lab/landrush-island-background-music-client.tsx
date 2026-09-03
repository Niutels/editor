'use client'

import { useAudio } from '@pascal-app/editor'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  advanceLandrushDayBackgroundMusicTrack,
  isLandrushLoadingShellHandedOff,
  LANDRUSH_BACKGROUND_MUSIC_FADE_IN_MS,
  LANDRUSH_BACKGROUND_MUSIC_FADE_OUT_MS,
  LANDRUSH_DAY_BACKGROUND_MUSIC_TRACKS,
  LANDRUSH_ZOMBIE_BACKGROUND_MUSIC_TRACK,
  type LandrushBackgroundMusicMode,
  type LandrushBackgroundMusicPlaybackState,
  resolveLandrushBackgroundMusicFadeEnvelope,
  resolveLandrushBackgroundMusicMode,
  resolveLandrushBackgroundMusicPreloadSource,
  resolveLandrushBackgroundMusicTrackFadeOutMs,
  resolveLandrushBackgroundMusicVolume,
  transitionLandrushBackgroundMusicMode,
} from './landrush-island-background-music'

type LandrushBackgroundMusicFadeKind = 'in' | 'mode-out' | 'track-out'

const LANDRUSH_LOADING_SHELL_SELECTOR = '[data-landrush-island-loading-shell]'
const LANDRUSH_ZOMBIE_HUD_PORTAL_SELECTOR = '[data-landrush-zombie-escape-hud-portal="true"]'
const LANDRUSH_ZOMBIE_PHASE_SELECTOR = '[data-integrated-landrush-world="true"][data-phase]'
const NOOP = () => undefined

export function LandrushIslandBackgroundMusic({
  initialPlayback,
}: {
  initialPlayback: LandrushBackgroundMusicPlaybackState
}) {
  const masterVolume = useAudio((state) => state.masterVolume)
  const muted = useAudio((state) => state.muted)
  const radioVolume = useAudio((state) => state.radioVolume)
  const [loadingHandedOff, setLoadingHandedOff] = useState(false)
  const [desiredMode, setDesiredMode] = useState<LandrushBackgroundMusicMode>('day')
  const [playback, setPlayback] = useState<LandrushBackgroundMusicPlaybackState>(initialPlayback)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const startPlaybackRef = useRef<() => void>(NOOP)
  const userActivatedRef = useRef(false)
  const desiredModeRef = useRef(desiredMode)
  const volumeEnvelopeRef = useRef(0)
  const volumeRef = useRef(0)
  const fadeFrameRef = useRef<number | null>(null)
  const fadeKindRef = useRef<LandrushBackgroundMusicFadeKind | null>(null)
  const endFadeTrackRef = useRef<string | null>(null)
  const modeTransitionGenerationRef = useRef(0)
  desiredModeRef.current = desiredMode

  const track =
    playback.mode === 'zombie'
      ? LANDRUSH_ZOMBIE_BACKGROUND_MUSIC_TRACK
      : (LANDRUSH_DAY_BACKGROUND_MUSIC_TRACKS[playback.dayTrackIndex] ??
        LANDRUSH_DAY_BACKGROUND_MUSIC_TRACKS[0])
  const volume = resolveLandrushBackgroundMusicVolume({
    masterVolume,
    mixGain: track.mixGain,
    muted,
    radioVolume,
  })
  const preloadSource = resolveLandrushBackgroundMusicPreloadSource({
    loadingHandedOff,
    trackSource: track.src,
  })
  volumeRef.current = volume

  const applyVolumeEnvelope = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = Math.min(1, Math.max(0, volumeRef.current * volumeEnvelopeRef.current))
  }, [])

  const cancelFade = useCallback(() => {
    if (fadeFrameRef.current !== null) cancelAnimationFrame(fadeFrameRef.current)
    fadeFrameRef.current = null
    fadeKindRef.current = null
  }, [])

  const beginFade = useCallback(
    (
      kind: LandrushBackgroundMusicFadeKind,
      targetEnvelope: number,
      durationMs: number,
      onComplete?: () => void,
    ) => {
      cancelFade()
      const fromEnvelope = volumeEnvelopeRef.current
      const startedAt = performance.now()
      const resolvedDurationMs = Math.max(0, durationMs)
      fadeKindRef.current = kind

      const finish = () => {
        fadeFrameRef.current = null
        fadeKindRef.current = null
        volumeEnvelopeRef.current = targetEnvelope
        applyVolumeEnvelope()
        onComplete?.()
      }
      if (resolvedDurationMs === 0) {
        finish()
        return
      }

      const step = (now: number) => {
        const elapsedMs = now - startedAt
        volumeEnvelopeRef.current = resolveLandrushBackgroundMusicFadeEnvelope({
          durationMs: resolvedDurationMs,
          elapsedMs,
          from: fromEnvelope,
          to: targetEnvelope,
        })
        applyVolumeEnvelope()
        if (elapsedMs >= resolvedDurationMs) {
          finish()
          return
        }
        fadeFrameRef.current = requestAnimationFrame(step)
      }
      fadeFrameRef.current = requestAnimationFrame(step)
    },
    [applyVolumeEnvelope, cancelFade],
  )

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(LANDRUSH_LOADING_SHELL_SELECTOR)
    const syncHandoff = () => setLoadingHandedOff(isLandrushLoadingShellHandedOff(shell))
    syncHandoff()
    if (!shell || isLandrushLoadingShellHandedOff(shell)) return

    const observer = new MutationObserver(() => {
      syncHandoff()
      if (isLandrushLoadingShellHandedOff(shell)) observer.disconnect()
    })
    observer.observe(shell, {
      attributeFilter: ['hidden', 'style'],
      attributes: true,
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const zombieEscapeEnabled =
      new URLSearchParams(window.location.search).get('game') === 'zombie-escape'
    if (!zombieEscapeEnabled) return

    const syncPhase = () => {
      const phaseRoot = document.querySelector<HTMLElement>(LANDRUSH_ZOMBIE_PHASE_SELECTOR)
      if (!phaseRoot) return
      setDesiredMode(resolveLandrushBackgroundMusicMode(phaseRoot.dataset.phase ?? null))
    }
    let observedPortal: HTMLElement | null = null
    const portalObserver = new MutationObserver(syncPhase)
    const observeCurrentPortal = () => {
      const portal = document.querySelector<HTMLElement>(LANDRUSH_ZOMBIE_HUD_PORTAL_SELECTOR)
      if (portal === observedPortal) {
        syncPhase()
        return
      }
      portalObserver.disconnect()
      observedPortal = portal
      if (portal) {
        portalObserver.observe(portal, {
          attributeFilter: ['data-phase'],
          attributes: true,
          childList: true,
          subtree: true,
        })
      }
      syncPhase()
    }
    const bodyObserver = new MutationObserver(observeCurrentPortal)
    bodyObserver.observe(document.body, { childList: true })
    observeCurrentPortal()
    return () => {
      bodyObserver.disconnect()
      portalObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    applyVolumeEnvelope()
    const audio = audioRef.current
    if (!audio) return
    if (volume <= 0) {
      cancelFade()
      volumeEnvelopeRef.current = 0
      applyVolumeEnvelope()
      audio.pause()
      return
    }
    if (userActivatedRef.current) startPlaybackRef.current()
  }, [applyVolumeEnvelope, cancelFade, volume])

  useEffect(() => {
    const expectedSource = preloadSource ?? null
    const audio = audioRef.current
    cancelFade()
    endFadeTrackRef.current = null
    volumeEnvelopeRef.current = 0
    applyVolumeEnvelope()
    audio?.pause()

    const startPlayback = () => {
      const currentAudio = audioRef.current
      if (
        !currentAudio ||
        !expectedSource ||
        !loadingHandedOff ||
        currentAudio.getAttribute('src') !== expectedSource ||
        document.visibilityState === 'hidden' ||
        volumeRef.current <= 0
      ) {
        return
      }
      if (!currentAudio.paused) {
        if (fadeKindRef.current === null && volumeEnvelopeRef.current < 1) {
          beginFade('in', 1, LANDRUSH_BACKGROUND_MUSIC_FADE_IN_MS)
        }
        return
      }
      void currentAudio.play().catch(NOOP)
    }
    startPlaybackRef.current = startPlayback
    if (userActivatedRef.current) startPlayback()
    return () => {
      if (startPlaybackRef.current === startPlayback) startPlaybackRef.current = NOOP
    }
  }, [applyVolumeEnvelope, beginFade, cancelFade, loadingHandedOff, preloadSource])

  useEffect(() => {
    const generation = modeTransitionGenerationRef.current + 1
    modeTransitionGenerationRef.current = generation
    const audio = audioRef.current

    if (desiredMode === playback.mode) {
      if (fadeKindRef.current === 'mode-out' && audio && !audio.paused) {
        beginFade('in', 1, LANDRUSH_BACKGROUND_MUSIC_FADE_IN_MS)
      }
      return
    }

    const commitMode = () => {
      if (
        modeTransitionGenerationRef.current !== generation ||
        desiredModeRef.current !== desiredMode
      ) {
        return
      }
      setPlayback((current) => transitionLandrushBackgroundMusicMode(current, desiredMode))
    }
    if (
      !loadingHandedOff ||
      !audio ||
      audio.paused ||
      volume <= 0 ||
      volumeEnvelopeRef.current <= 0
    ) {
      commitMode()
      return
    }
    const remainingMs = Number.isFinite(audio.duration)
      ? Math.max(0, (audio.duration - audio.currentTime) * 1_000)
      : LANDRUSH_BACKGROUND_MUSIC_FADE_OUT_MS
    beginFade(
      'mode-out',
      0,
      Math.min(LANDRUSH_BACKGROUND_MUSIC_FADE_OUT_MS, remainingMs),
      commitMode,
    )
    return () => {
      if (modeTransitionGenerationRef.current === generation) {
        modeTransitionGenerationRef.current += 1
      }
    }
  }, [beginFade, desiredMode, loadingHandedOff, playback.mode, volume])

  useEffect(() => {
    const activate = () => {
      userActivatedRef.current = true
      startPlaybackRef.current()
    }
    window.addEventListener('keydown', activate)
    window.addEventListener('pointerdown', activate, { passive: true })
    return () => {
      window.removeEventListener('keydown', activate)
      window.removeEventListener('pointerdown', activate)
    }
  }, [])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        cancelFade()
        volumeEnvelopeRef.current = 0
        applyVolumeEnvelope()
        audioRef.current?.pause()
        setPlayback((current) =>
          current.mode === desiredModeRef.current
            ? current
            : transitionLandrushBackgroundMusicMode(current, desiredModeRef.current),
        )
      } else if (userActivatedRef.current) {
        startPlaybackRef.current()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [applyVolumeEnvelope, cancelFade])

  useEffect(
    () => () => {
      cancelFade()
      audioRef.current?.pause()
      startPlaybackRef.current = NOOP
    },
    [cancelFade],
  )

  return (
    // biome-ignore lint/a11y/useMediaCaption: These authored instrumental tracks contain no speech to caption.
    <audio
      data-landrush-background-music
      data-landrush-background-music-mode={playback.mode}
      data-landrush-background-music-playing="false"
      data-landrush-background-music-track={track.id}
      hidden
      loop={playback.mode === 'zombie'}
      onEnded={() => {
        cancelFade()
        endFadeTrackRef.current = null
        volumeEnvelopeRef.current = 0
        applyVolumeEnvelope()
        setPlayback((current) =>
          current.mode === desiredModeRef.current
            ? advanceLandrushDayBackgroundMusicTrack(current)
            : transitionLandrushBackgroundMusicMode(current, desiredModeRef.current),
        )
      }}
      onPause={(event) => {
        event.currentTarget.dataset.landrushBackgroundMusicPlaying = 'false'
      }}
      onPlay={(event) => {
        event.currentTarget.dataset.landrushBackgroundMusicPlaying = 'true'
        if (fadeKindRef.current === null && volumeEnvelopeRef.current < 1) {
          beginFade('in', 1, LANDRUSH_BACKGROUND_MUSIC_FADE_IN_MS)
        }
      }}
      onTimeUpdate={(event) => {
        if (playback.mode !== 'day' || fadeKindRef.current === 'mode-out') return
        const fadeOutMs = resolveLandrushBackgroundMusicTrackFadeOutMs({
          currentTime: event.currentTarget.currentTime,
          duration: event.currentTarget.duration,
        })
        if (fadeOutMs === null || endFadeTrackRef.current === track.id) return
        endFadeTrackRef.current = track.id
        beginFade('track-out', 0, fadeOutMs)
      }}
      preload={preloadSource ? 'auto' : 'none'}
      ref={audioRef}
      src={preloadSource}
    />
  )
}
