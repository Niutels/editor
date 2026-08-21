'use client'

import { useAudio } from '@pascal-app/editor'
import { useFrame, useThree } from '@react-three/fiber'
import { Howl, Howler } from 'howler'
import { type MutableRefObject, useEffect, useRef } from 'react'
import {
  ZOMBIE_ESCAPE_AUDIO_ASSETS_READY,
  ZOMBIE_ESCAPE_AUDIO_CUES,
  type ZombieEscapeAudioCue,
} from './zombie-escape-audio-catalog'
import {
  ZOMBIE_ESCAPE_AUDIO_EVENT_KIND,
  type ZombieEscapeAudioEventRing,
} from './zombie-escape-audio-events'
import type { ZombieEscapeSimulation } from './zombie-escape-simulation'

type ZombieEscapeAudioVoicePool = {
  cursor: number
  ids: Float64Array
  sounds: Array<Howl | null>
  startedAt: Float64Array
}

type ZombieEscapeAudioCueRuntime = {
  cue: ZombieEscapeAudioCue
  lastPlayedAt: number
  nextVariation: number
  sounds: Howl[]
  voices: ZombieEscapeAudioVoicePool
}

type ZombieEscapeAudioRuntime = {
  audioContext: AudioContext | null
  byKind: Array<ZombieEscapeAudioCueRuntime | undefined>
  loadFailed: boolean
  ready: boolean
  shotByWeapon: Array<ZombieEscapeAudioCueRuntime | undefined>
  sounds: Howl[]
}

export type ZombieEscapeAudioSpatialMix = {
  gain: number
  pan: number
}

const AUDIO_FRAME_PRIORITY = 0.95
const AUDIO_FAILURE_BACKOFF_MS = 5_000
const HASH_SCALE = 1 / 4_294_967_296

export function ZombieEscapeAudio({
  active,
  framePriority = AUDIO_FRAME_PRIORITY,
  originX,
  originY,
  originZ,
  simulationRef,
}: {
  active: boolean
  framePriority?: number
  originX: number
  originY: number
  originZ: number
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  const camera = useThree((state) => state.camera)
  const masterVolume = useAudio((state) => state.masterVolume)
  const muted = useAudio((state) => state.muted)
  const sfxVolume = useAudio((state) => state.sfxVolume)
  const runtimeRef = useRef<ZombieEscapeAudioRuntime | null>(null)
  const retryAtRef = useRef(0)
  const cursorRef = useRef(simulationRef.current.audioEvents.writeSequence)
  const spatialMixRef = useRef<ZombieEscapeAudioSpatialMix>({ gain: 1, pan: 0 })

  useEffect(() => {
    if (!ZOMBIE_ESCAPE_AUDIO_ASSETS_READY) return
    try {
      runtimeRef.current = createZombieEscapeAudioRuntime()
    } catch {
      retryAtRef.current = performance.now() + AUDIO_FAILURE_BACKOFF_MS
    }
    return () => {
      const runtime = runtimeRef.current
      runtimeRef.current = null
      if (runtime) disposeZombieEscapeAudioRuntime(runtime)
    }
  }, [])

  useEffect(() => {
    const runtime = runtimeRef.current
    if ((!active || muted || masterVolume <= 0 || sfxVolume <= 0) && runtime) {
      stopZombieEscapeAudioRuntime(runtime)
    }
  }, [active, masterVolume, muted, sfxVolume])

  useFrame(() => {
    const events = simulationRef.current.audioEvents
    const latestSequence = events.writeSequence
    if (!active || muted || masterVolume <= 0 || sfxVolume <= 0) {
      cursorRef.current = latestSequence
      return
    }

    const now = performance.now()
    if (now < retryAtRef.current) return
    let runtime = runtimeRef.current
    try {
      if (!runtime || runtime.audioContext !== (Howler.ctx ?? null)) {
        if (runtime) disposeZombieEscapeAudioRuntime(runtime)
        runtime = createZombieEscapeAudioRuntime()
        runtimeRef.current = runtime
      }
      if (!runtime.ready) {
        if (runtime.loadFailed) throw new Error('Zombie Escape audio failed to load')
        runtime.ready = true
        for (const sound of runtime.sounds) {
          const soundState = sound.state()
          if (soundState === 'unloaded') throw new Error('Zombie Escape audio failed to load')
          if (soundState !== 'loaded') runtime.ready = false
        }
        if (!runtime.ready) return
      }

      const firstAvailableSequence = Math.max(1, latestSequence - events.capacity + 1)
      const firstSequence = Math.max(firstAvailableSequence, cursorRef.current + 1)
      const volumeScale = (masterVolume / 100) * (sfxVolume / 100)
      const cameraElements = camera.matrixWorld.elements
      for (let sequence = firstSequence; sequence <= latestSequence; sequence += 1) {
        const slot = (sequence - 1) % events.capacity
        if (events.sequence[slot] !== sequence) continue
        playZombieEscapeAudioEvent(
          runtime,
          events,
          slot,
          sequence,
          now,
          volumeScale,
          originX,
          originY,
          originZ,
          cameraElements,
          spatialMixRef.current,
        )
        cursorRef.current = sequence
      }
    } catch {
      runtimeRef.current = null
      if (runtime) disposeZombieEscapeAudioRuntime(runtime)
      retryAtRef.current = now + AUDIO_FAILURE_BACKOFF_MS
    }
  }, framePriority)

  return null
}

export function resolveZombieEscapeAudioSpatialMix(
  offsetX: number,
  offsetY: number,
  offsetZ: number,
  cameraRightX: number,
  cameraRightY: number,
  cameraRightZ: number,
  referenceDistance: number,
  maximumDistance: number,
  output: ZombieEscapeAudioSpatialMix,
) {
  const distance = Math.hypot(offsetX, offsetY, offsetZ)
  if (distance >= maximumDistance) {
    output.gain = 0
    output.pan = 0
    return output
  }
  const inverseDistance = 1 / Math.max(0.000_001, distance)
  output.pan = Math.max(
    -1,
    Math.min(
      1,
      (offsetX * cameraRightX + offsetY * cameraRightY + offsetZ * cameraRightZ) * inverseDistance,
    ),
  )
  if (distance <= referenceDistance) {
    output.gain = 1
    return output
  }
  const progress = Math.min(
    1,
    (distance - referenceDistance) / Math.max(0.000_001, maximumDistance - referenceDistance),
  )
  const smoothProgress = progress * progress * (3 - 2 * progress)
  output.gain = 1 - smoothProgress
  return output
}

function createZombieEscapeAudioRuntime(): ZombieEscapeAudioRuntime {
  const byKind: Array<ZombieEscapeAudioCueRuntime | undefined> = []
  const shotByWeapon: Array<ZombieEscapeAudioCueRuntime | undefined> = []
  const sounds: Howl[] = []
  const runtime: ZombieEscapeAudioRuntime = {
    audioContext: null,
    byKind,
    loadFailed: false,
    ready: false,
    shotByWeapon,
    sounds,
  }
  for (const cue of ZOMBIE_ESCAPE_AUDIO_CUES) {
    const cueSounds = cue.files.map((source) => {
      const sound = new Howl({
        onloaderror: () => {
          runtime.loadFailed = true
        },
        pool: cue.playback.maxVoices,
        preload: true,
        src: [source],
      })
      sounds.push(sound)
      return sound
    })
    const cueRuntime: ZombieEscapeAudioCueRuntime = {
      cue,
      lastPlayedAt: Number.NEGATIVE_INFINITY,
      nextVariation: 0,
      sounds: cueSounds,
      voices: {
        cursor: 0,
        ids: new Float64Array(cue.playback.maxVoices),
        sounds: Array.from({ length: cue.playback.maxVoices }, () => null),
        startedAt: new Float64Array(cue.playback.maxVoices),
      },
    }
    if (cue.kind === ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.shotFired) {
      shotByWeapon[cue.weaponIndex] = cueRuntime
    } else {
      byKind[cue.kind] = cueRuntime
    }
  }
  runtime.audioContext = Howler.ctx ?? null
  runtime.ready = sounds.every((sound) => sound.state() === 'loaded')
  return runtime
}

function playZombieEscapeAudioEvent(
  runtime: ZombieEscapeAudioRuntime,
  events: ZombieEscapeAudioEventRing,
  eventSlot: number,
  sequence: number,
  now: number,
  volumeScale: number,
  originX: number,
  originY: number,
  originZ: number,
  cameraElements: readonly number[],
  spatialMix: ZombieEscapeAudioSpatialMix,
) {
  const kind = events.kind[eventSlot]!
  const subjectIndex = events.subjectIndex[eventSlot]!
  const cueRuntime =
    kind === ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.shotFired
      ? runtime.shotByWeapon[subjectIndex]
      : runtime.byKind[kind]
  if (!cueRuntime || now - cueRuntime.lastPlayedAt < cueRuntime.cue.playback.minIntervalMs) return

  const variation = cueRuntime.nextVariation % cueRuntime.sounds.length
  cueRuntime.nextVariation += 1
  const sound = cueRuntime.sounds[variation]
  if (sound?.state() !== 'loaded') throw new Error('Zombie Escape audio runtime is not loaded')

  let spatialGain = 1
  let pan = 0
  const playback = cueRuntime.cue.playback
  if (playback.spatial) {
    resolveZombieEscapeAudioSpatialMix(
      events.x[eventSlot]! + originX - (cameraElements[12] ?? 0),
      events.y[eventSlot]! + originY - (cameraElements[13] ?? 0),
      events.z[eventSlot]! + originZ - (cameraElements[14] ?? 0),
      cameraElements[0] ?? 1,
      cameraElements[1] ?? 0,
      cameraElements[2] ?? 0,
      playback.referenceDistance ?? 1,
      playback.maxDistance ?? 1,
      spatialMix,
    )
    spatialGain = spatialMix.gain
    pan = spatialMix.pan
    if (spatialGain <= 0) return
  }

  const voiceSlot = acquireZombieEscapeAudioVoice(cueRuntime.voices, now)
  const previousSound = cueRuntime.voices.sounds[voiceSlot]
  const previousId = cueRuntime.voices.ids[voiceSlot]!
  if (previousSound?.playing(previousId)) previousSound.stop(previousId)
  const id = sound.play()
  cueRuntime.voices.sounds[voiceSlot] = sound
  cueRuntime.voices.ids[voiceSlot] = id
  cueRuntime.voices.startedAt[voiceSlot] = now
  cueRuntime.lastPlayedAt = now

  const [minimumRate, maximumRate] = playback.rateRange
  const randomUnit = ((Math.imul(sequence, 1_664_525) + 1_013_904_223) >>> 0) * HASH_SCALE
  sound.rate(minimumRate + (maximumRate - minimumRate) * randomUnit, id)
  sound.volume(playback.volume * volumeScale * spatialGain, id)
  if (playback.spatial) sound.stereo(pan, id)
  if (Howler.ctx?.state === 'suspended') void Howler.ctx.resume().catch(() => {})
}

function acquireZombieEscapeAudioVoice(voices: ZombieEscapeAudioVoicePool, now: number) {
  let oldestSlot = voices.cursor
  let oldestStartedAt = Number.POSITIVE_INFINITY
  for (let offset = 0; offset < voices.sounds.length; offset += 1) {
    const slot = (voices.cursor + offset) % voices.sounds.length
    const sound = voices.sounds[slot]
    const id = voices.ids[slot]!
    if (!sound?.playing(id)) {
      voices.cursor = (slot + 1) % voices.sounds.length
      return slot
    }
    if (voices.startedAt[slot]! < oldestStartedAt) {
      oldestStartedAt = voices.startedAt[slot]!
      oldestSlot = slot
    }
  }
  voices.cursor = (oldestSlot + 1) % voices.sounds.length
  voices.startedAt[oldestSlot] = now
  return oldestSlot
}

function stopZombieEscapeAudioRuntime(runtime: ZombieEscapeAudioRuntime) {
  for (const sound of runtime.sounds) {
    try {
      sound.stop()
    } catch {}
  }
}

function disposeZombieEscapeAudioRuntime(runtime: ZombieEscapeAudioRuntime) {
  for (const sound of runtime.sounds) {
    try {
      sound.unload()
    } catch {}
  }
}
