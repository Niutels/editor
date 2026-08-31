'use client'

import { useAudio } from '@pascal-app/editor'
import { useFrame, useThree } from '@react-three/fiber'
import { Howl, Howler } from 'howler'
import { type MutableRefObject, useEffect, useRef } from 'react'
import {
  ZOMBIE_ESCAPE_AUDIO_ASSETS_READY,
  ZOMBIE_ESCAPE_AUDIO_CUES,
  ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
  type ZombieEscapeAudioCue,
  type ZombieEscapePresenceAudioCue,
} from './zombie-escape-audio-catalog'
import {
  ZOMBIE_ESCAPE_AUDIO_EVENT_KIND,
  type ZombieEscapeAudioEventRing,
} from './zombie-escape-audio-events'
import { ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND } from './zombie-escape-simulation'

export type ZombieEscapePresenceAudioSource = Readonly<{
  elapsedSeconds: number
  paused: boolean
  phase: 'build' | 'night'
  player: Readonly<{ health: number; x: number; y: number; z: number }>
  seed: number
  status: 'lost' | 'playing' | 'won'
  zombies: Readonly<{
    health: Float32Array
    pool: Readonly<{
      active: Uint8Array
      capacity: number
      generation: Uint32Array
    }>
    x: Float32Array
    y: Float32Array
    z: Float32Array
  }>
}>

export type ZombieEscapeAudioEventSource = Readonly<{
  audioEvents: ZombieEscapeAudioEventRing
  impactEvents?: ZombieEscapeWeaponImpactAudioEvents
}> &
  Partial<ZombieEscapePresenceAudioSource>

export type ZombieEscapeWeaponImpactAudioEvents = Readonly<{
  effectKind: Uint8Array
  pool: Readonly<{
    active: Uint8Array
    capacity: number
    generation: Uint32Array
  }>
  weaponIndex: Uint8Array
  x: Float32Array
  y: Float32Array
  z: Float32Array
}>

export type ZombieEscapeWeaponImpactAudioEventVisitor = (
  events: ZombieEscapeWeaponImpactAudioEvents,
  slot: number,
  generation: number,
) => void

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

export type ZombieEscapePresenceAudioSchedule = {
  audible: Uint8Array
  enabled: boolean
  globalNextStartAt: number
  nextEligibleAt: Float64Array
  observedGeneration: Uint32Array
  utteranceOrdinal: Uint32Array
}

type ZombieEscapePresenceAudioVoicePool = {
  ids: Float64Array
  ownerGenerations: Uint32Array
  ownerSlots: Int16Array
  pans: Float32Array
  sounds: Array<Howl | null>
  spatialGains: Float32Array
  startedAt: Float64Array
  volumes: Float32Array
}

type ZombieEscapePresenceAudioRuntime = {
  cue: ZombieEscapePresenceAudioCue
  schedule: ZombieEscapePresenceAudioSchedule
  sounds: Howl[]
  voices: ZombieEscapePresenceAudioVoicePool
}

type ZombieEscapeAudioRuntime = {
  audioContext: AudioContext | null
  byKind: Array<ZombieEscapeAudioCueRuntime | undefined>
  impactByWeapon: Array<ZombieEscapeAudioCueRuntime | undefined>
  loadState: ZombieEscapeAudioLoadState
  presence: ZombieEscapePresenceAudioRuntime
  ready: boolean
  shotByWeapon: Array<ZombieEscapeAudioCueRuntime | undefined>
  sounds: Howl[]
}

export type ZombieEscapeAudioSpatialMix = { gain: number; pan: number }

export type ZombieEscapeAudioLoadState = { failed: boolean }

export type ZombieEscapeRealtimeAudioCursorState = {
  impactElapsedSeconds: number
  impactGeneration: Uint32Array
  playbackAvailable: boolean
  sequence: number
}

const AUDIO_FRAME_PRIORITY = 0.95
const AUDIO_FAILURE_BACKOFF_MS = 5_000
const HASH_SCALE = 1 / 4_294_967_296
const PRESENCE_INITIAL_DELAY_SALT = 0x43c6_5a9d
const PRESENCE_INTERVAL_SALT = 0x9e37_79b9
const PRESENCE_RATE_SALT = 0x85eb_ca6b
const PRESENCE_VARIATION_SALT = 0xc2b2_ae35
const PRESENCE_MIX_EPSILON = 0.002
const SPATIAL_ROLLOFF_FACTOR = 0.6

export function resumeZombieEscapeAudioContext() {
  if (Howler.ctx?.state !== 'suspended') return Promise.resolve()
  return Howler.ctx.resume()
}

export function resolveZombieEscapeAudioEventCursor(
  currentSequence: number,
  latestSequence: number,
  realtimePlaybackAvailable: boolean,
) {
  return realtimePlaybackAvailable ? currentSequence : latestSequence
}

export function shouldCreateZombieEscapeAudioRuntime(assetsReady: boolean, muted: boolean) {
  return assetsReady && !muted
}

export function createZombieEscapeRealtimeAudioCursorState(
  source: ZombieEscapeAudioEventSource,
): ZombieEscapeRealtimeAudioCursorState {
  return {
    impactElapsedSeconds: source.elapsedSeconds ?? 0,
    impactGeneration: new Uint32Array(source.impactEvents?.pool.capacity ?? 0),
    playbackAvailable: false,
    sequence: source.audioEvents.writeSequence,
  }
}

export function synchronizeZombieEscapeRealtimeAudioCursor(
  state: ZombieEscapeRealtimeAudioCursorState,
  source: ZombieEscapeAudioEventSource,
  playbackAvailable: boolean,
) {
  const impactEvents = source.impactEvents
  const impactCapacity = impactEvents?.pool.capacity ?? 0
  const availabilityChanged = state.playbackAvailable !== playbackAvailable
  const capacityChanged = state.impactGeneration.length !== impactCapacity
  const elapsedSeconds = source.elapsedSeconds
  const elapsedRewound = elapsedSeconds !== undefined && elapsedSeconds < state.impactElapsedSeconds
  if (elapsedSeconds !== undefined) state.impactElapsedSeconds = elapsedSeconds
  if (!availabilityChanged && !capacityChanged && !elapsedRewound) return false

  state.playbackAvailable = playbackAvailable
  state.sequence = source.audioEvents.writeSequence
  const observed = capacityChanged ? new Uint32Array(impactCapacity) : state.impactGeneration
  if (impactEvents) {
    for (let slot = 0; slot < impactCapacity; slot += 1) {
      observed[slot] =
        impactEvents.pool.active[slot] === 0 ? 0 : impactEvents.pool.generation[slot]!
    }
  }
  state.impactGeneration = observed
  return true
}

export function visitZombieEscapeWeaponImpactAudioEvents(
  events: ZombieEscapeWeaponImpactAudioEvents,
  observedGeneration: Uint32Array,
  visitor: ZombieEscapeWeaponImpactAudioEventVisitor,
) {
  if (observedGeneration.length !== events.pool.capacity) {
    throw new Error('Weapon impact audio cursor capacity does not match its event pool')
  }
  for (let slot = 0; slot < events.pool.capacity; slot += 1) {
    if (events.pool.active[slot] === 0) {
      observedGeneration[slot] = 0
      continue
    }
    const generation = events.pool.generation[slot]!
    if (generation === 0 || observedGeneration[slot] === generation) continue
    observedGeneration[slot] = generation
    if (events.effectKind[slot] === ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.blastVictim) {
      continue
    }
    visitor(events, slot, generation)
  }
}

export function createZombieEscapeAudioLoadState(): ZombieEscapeAudioLoadState {
  return { failed: false }
}

export function createZombieEscapeAudioSoundOptions(
  source: string,
  maxVoices: number,
  loadState: ZombieEscapeAudioLoadState,
  playback?: ZombieEscapeAudioCue['playback'],
) {
  return {
    ...(playback?.spatial
      ? {
          distanceModel: 'inverse' as const,
          maxDistance: playback.maxDistance ?? 10_000,
          panningModel: 'HRTF' as const,
          refDistance: playback.referenceDistance ?? 1,
          rolloffFactor: 0,
        }
      : {}),
    onloaderror: () => {
      loadState.failed = true
    },
    pool: maxVoices,
    preload: true,
    src: [source],
  }
}

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
  simulationRef: MutableRefObject<ZombieEscapeAudioEventSource>
}) {
  const camera = useThree((state) => state.camera)
  const masterVolume = useAudio((state) => state.masterVolume)
  const muted = useAudio((state) => state.muted)
  const sfxVolume = useAudio((state) => state.sfxVolume)
  const runtimeEnabled = shouldCreateZombieEscapeAudioRuntime(
    ZOMBIE_ESCAPE_AUDIO_ASSETS_READY,
    muted,
  )
  const runtimeRef = useRef<ZombieEscapeAudioRuntime | null>(null)
  const retryAtRef = useRef(0)
  const realtimeCursorRef = useRef<ZombieEscapeRealtimeAudioCursorState | null>(null)
  if (!realtimeCursorRef.current) {
    realtimeCursorRef.current = createZombieEscapeRealtimeAudioCursorState(simulationRef.current)
  }
  const listenerTransformRef = useRef(Array.from({ length: 16 }, () => 0))
  const spatialMixRef = useRef<ZombieEscapeAudioSpatialMix>({ gain: 1, pan: 0 })

  useEffect(() => {
    if (!runtimeEnabled) return
    try {
      runtimeRef.current = createZombieEscapeAudioRuntime(
        resolveZombieEscapePresenceCapacity(simulationRef.current),
      )
    } catch {
      retryAtRef.current = performance.now() + AUDIO_FAILURE_BACKOFF_MS
    }
    return () => {
      const runtime = runtimeRef.current
      runtimeRef.current = null
      if (runtime) disposeZombieEscapeAudioRuntime(runtime)
    }
  }, [runtimeEnabled, simulationRef])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!active || !runtimeEnabled || masterVolume <= 0 || sfxVolume <= 0) {
      if (runtime) stopZombieEscapeAudioRuntime(runtime)
      synchronizeZombieEscapeRealtimeAudioCursor(
        realtimeCursorRef.current!,
        simulationRef.current,
        false,
      )
    }
  }, [active, masterVolume, runtimeEnabled, sfxVolume, simulationRef])

  useFrame(() => {
    const source = simulationRef.current
    const events = source.audioEvents
    const impactEvents = source.impactEvents
    const realtimeCursor = realtimeCursorRef.current!
    const latestSequence = events.writeSequence
    if (!runtimeEnabled || !active || masterVolume <= 0 || sfxVolume <= 0) {
      synchronizeZombieEscapeRealtimeAudioCursor(realtimeCursor, source, false)
      return
    }

    const now = performance.now()
    if (now < retryAtRef.current) {
      synchronizeZombieEscapeRealtimeAudioCursor(realtimeCursor, source, false)
      return
    }
    let runtime = runtimeRef.current
    try {
      if (!runtime || runtime.audioContext !== (Howler.ctx ?? null)) {
        if (runtime) disposeZombieEscapeAudioRuntime(runtime)
        runtime = createZombieEscapeAudioRuntime(resolveZombieEscapePresenceCapacity(source))
        runtimeRef.current = runtime
      }
      if (runtime.loadState.failed) throw new Error('Zombie Escape audio failed to load')
      if (!runtime.ready) {
        runtime.ready = true
        for (const sound of runtime.sounds) {
          const soundState = sound.state()
          if (soundState === 'unloaded') throw new Error('Zombie Escape audio failed to load')
          if (soundState !== 'loaded') runtime.ready = false
        }
        if (!runtime.ready) {
          synchronizeZombieEscapeRealtimeAudioCursor(realtimeCursor, source, false)
          return
        }
      }

      synchronizeZombieEscapeRealtimeAudioCursor(realtimeCursor, source, true)
      const firstAvailableSequence = Math.max(1, latestSequence - events.capacity + 1)
      const firstSequence = Math.max(firstAvailableSequence, realtimeCursor.sequence + 1)
      const volumeScale = (masterVolume / 100) * (sfxVolume / 100)
      const cameraElements = camera.matrixWorld.elements
      const listenerElements = resolveZombieEscapeAudioListenerTransform(
        source,
        originX,
        originY,
        originZ,
        cameraElements,
        listenerTransformRef.current,
      )
      updateZombieEscapeAudioListener(listenerElements)
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
          listenerElements,
          spatialMixRef.current,
        )
        realtimeCursor.sequence = sequence
      }
      if (impactEvents) {
        const impactRuntime = runtime
        visitZombieEscapeWeaponImpactAudioEvents(
          impactEvents,
          realtimeCursor.impactGeneration,
          (impactPool, slot, generation) => {
            const cueRuntime = impactRuntime.impactByWeapon[impactPool.weaponIndex[slot]!]
            if (!cueRuntime) return
            playZombieEscapeAudioCueRuntime(
              cueRuntime,
              (Math.imul(generation, 0x9e37_79b1) + slot) >>> 0,
              now,
              volumeScale,
              impactPool.x[slot]! + originX,
              impactPool.y[slot]! + originY,
              impactPool.z[slot]! + originZ,
              listenerElements,
              spatialMixRef.current,
            )
          },
        )
      }

      if (
        isZombieEscapePresenceAudioSource(source) &&
        shouldPlayZombieEscapePresenceAudio(source)
      ) {
        updateZombieEscapePresenceAudio(
          runtime.presence,
          source,
          volumeScale,
          originX,
          originY,
          originZ,
          listenerElements,
          spatialMixRef.current,
        )
      } else {
        stopZombieEscapePresenceAudioRuntime(runtime.presence)
      }
    } catch (error) {
      synchronizeZombieEscapeRealtimeAudioCursor(realtimeCursor, source, false)
      runtimeRef.current = null
      if (runtime) disposeZombieEscapeAudioRuntime(runtime)
      retryAtRef.current = now + AUDIO_FAILURE_BACKOFF_MS
      console.warn('[zombie-escape] Audio runtime failed; retrying.', error)
    }
  }, framePriority)

  return null
}

export function shouldPlayZombieEscapePresenceAudio(source: ZombieEscapePresenceAudioSource) {
  return (
    source.phase === 'night' &&
    source.status === 'playing' &&
    !source.paused &&
    source.player.health > 0
  )
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
  output.gain = resolveZombieEscapeDistanceGain(distance, referenceDistance, maximumDistance)
  return output
}

export function resolveZombieEscapeAudioListenerTransform(
  source: ZombieEscapeAudioEventSource,
  originX: number,
  originY: number,
  originZ: number,
  cameraElements: readonly number[],
  output: number[],
) {
  for (let index = 0; index < 16; index += 1) {
    output[index] = cameraElements[index] ?? (index % 5 === 0 ? 1 : 0)
  }
  if (isZombieEscapePresenceAudioSource(source)) {
    output[12] = source.player.x + originX
    output[13] = source.player.y + originY
    output[14] = source.player.z + originZ
  }
  return output
}

export function resolveZombieEscapePresenceAudioSpatialMix(
  offsetX: number,
  offsetY: number,
  offsetZ: number,
  cameraRightX: number,
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
  const horizontalDistance = Math.hypot(offsetX, offsetZ)
  const horizontalRightLength = Math.hypot(cameraRightX, cameraRightZ)
  output.pan =
    horizontalDistance <= 0.000_001 || horizontalRightLength <= 0.000_001
      ? 0
      : Math.max(
          -1,
          Math.min(
            1,
            (offsetX * cameraRightX + offsetZ * cameraRightZ) /
              (horizontalDistance * horizontalRightLength),
          ),
        )
  output.gain = resolveZombieEscapeDistanceGain(distance, referenceDistance, maximumDistance)
  return output
}

export function createZombieEscapePresenceAudioSchedule(
  capacity: number,
): ZombieEscapePresenceAudioSchedule {
  const resolvedCapacity = Math.max(1, Math.trunc(capacity))
  return {
    audible: new Uint8Array(resolvedCapacity),
    enabled: false,
    globalNextStartAt: Number.NEGATIVE_INFINITY,
    nextEligibleAt: new Float64Array(resolvedCapacity),
    observedGeneration: new Uint32Array(resolvedCapacity),
    utteranceOrdinal: new Uint32Array(resolvedCapacity),
  }
}

export function resetZombieEscapePresenceAudioSchedule(
  schedule: ZombieEscapePresenceAudioSchedule,
) {
  schedule.audible.fill(0)
  schedule.enabled = false
  schedule.globalNextStartAt = Number.NEGATIVE_INFINITY
  schedule.nextEligibleAt.fill(0)
  schedule.observedGeneration.fill(0)
  schedule.utteranceOrdinal.fill(0)
}

export function selectZombieEscapePresenceAudioCandidate(
  schedule: ZombieEscapePresenceAudioSchedule,
  source: ZombieEscapePresenceAudioSource,
  cue: ZombieEscapePresenceAudioCue,
  listenerX: number,
  listenerY: number,
  listenerZ: number,
  voiceOwnerSlots: Int16Array,
  voiceOwnerGenerations: Uint32Array,
) {
  const zombies = source.zombies
  const now = source.elapsedSeconds
  const startDistanceSquared = cue.playback.maxDistance ** 2
  const stopDistance = cue.playback.maxDistance + cue.schedule.rangeHysteresisMeters
  const stopDistanceSquared = stopDistance ** 2
  let candidate = -1
  let candidateDueAt = Number.POSITIVE_INFINITY
  let candidateDistanceSquared = Number.POSITIVE_INFINITY
  schedule.enabled = true

  for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
    if (zombies.pool.active[slot] === 0 || zombies.health[slot]! <= 0) {
      schedule.audible[slot] = 0
      continue
    }
    const generation = zombies.pool.generation[slot]!
    const offsetX = zombies.x[slot]! - listenerX
    const offsetY = zombies.y[slot]! - listenerY
    const offsetZ = zombies.z[slot]! - listenerZ
    const distanceSquared = offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ

    if (schedule.observedGeneration[slot] !== generation) {
      schedule.observedGeneration[slot] = generation
      schedule.utteranceOrdinal[slot] = 0
      schedule.audible[slot] = distanceSquared <= startDistanceSquared ? 1 : 0
      schedule.nextEligibleAt[slot] =
        now +
        resolveZombieEscapePresenceScheduleDelay(
          source.seed,
          slot,
          generation,
          0,
          PRESENCE_INITIAL_DELAY_SALT,
          cue.schedule.initialDelaySeconds,
        )
    } else if (schedule.audible[slot] !== 0) {
      if (distanceSquared >= stopDistanceSquared) schedule.audible[slot] = 0
    } else if (distanceSquared <= startDistanceSquared) {
      schedule.audible[slot] = 1
      schedule.nextEligibleAt[slot] = Math.max(
        schedule.nextEligibleAt[slot]!,
        now +
          resolveZombieEscapePresenceScheduleDelay(
            source.seed,
            slot,
            generation,
            schedule.utteranceOrdinal[slot]!,
            PRESENCE_INITIAL_DELAY_SALT,
            cue.schedule.initialDelaySeconds,
          ),
      )
    }

    const dueAt = schedule.nextEligibleAt[slot]!
    if (
      schedule.audible[slot] === 0 ||
      now < schedule.globalNextStartAt ||
      now < dueAt ||
      isZombieEscapePresenceVoiceOwned(voiceOwnerSlots, voiceOwnerGenerations, slot, generation)
    ) {
      continue
    }
    if (
      dueAt < candidateDueAt ||
      (dueAt === candidateDueAt && distanceSquared < candidateDistanceSquared)
    ) {
      candidate = slot
      candidateDueAt = dueAt
      candidateDistanceSquared = distanceSquared
    }
  }
  return candidate
}

export function commitZombieEscapePresenceAudioStart(
  schedule: ZombieEscapePresenceAudioSchedule,
  source: ZombieEscapePresenceAudioSource,
  cue: ZombieEscapePresenceAudioCue,
  slot: number,
) {
  if (
    slot < 0 ||
    slot >= source.zombies.pool.capacity ||
    source.zombies.pool.active[slot] === 0 ||
    source.zombies.health[slot]! <= 0
  ) {
    return false
  }
  const generation = source.zombies.pool.generation[slot]!
  if (schedule.observedGeneration[slot] !== generation || schedule.audible[slot] === 0) {
    return false
  }
  const ordinal = (schedule.utteranceOrdinal[slot]! + 1) >>> 0
  schedule.utteranceOrdinal[slot] = ordinal
  schedule.nextEligibleAt[slot] =
    source.elapsedSeconds +
    resolveZombieEscapePresenceScheduleDelay(
      source.seed,
      slot,
      generation,
      ordinal,
      PRESENCE_INTERVAL_SALT,
      cue.schedule.intervalSeconds,
    )
  schedule.globalNextStartAt = source.elapsedSeconds + cue.playback.minIntervalMs / 1_000
  return true
}

export function resolveZombieEscapePresenceScheduleDelay(
  seed: number,
  slot: number,
  generation: number,
  ordinal: number,
  salt: number,
  range: readonly [number, number],
) {
  const randomUnit = resolveZombieEscapePresenceHash(seed, slot, generation, ordinal, salt)
  return range[0] + (range[1] - range[0]) * randomUnit
}

export function resolveZombieEscapePresenceVariation(
  seed: number,
  slot: number,
  generation: number,
  ordinal: number,
  variationCount: number,
) {
  const count = Math.max(1, Math.trunc(variationCount))
  const startingVariation = Math.floor(
    resolveZombieEscapePresenceHash(seed, slot, generation, 0, PRESENCE_VARIATION_SALT) * count,
  )
  return (startingVariation + ordinal) % count
}

function resolveZombieEscapeDistanceGain(
  distance: number,
  referenceDistance: number,
  maximumDistance: number,
) {
  if (distance <= referenceDistance) return 1
  if (distance >= maximumDistance) return 0
  const inverseGain =
    referenceDistance /
    (referenceDistance + SPATIAL_ROLLOFF_FACTOR * (distance - referenceDistance))
  const edgeFadeDistance = Math.min(6, (maximumDistance - referenceDistance) * 0.25)
  const edgeFadeStart = maximumDistance - edgeFadeDistance
  if (distance <= edgeFadeStart) return inverseGain
  const edgeProgress = (distance - edgeFadeStart) / Math.max(0.000_001, edgeFadeDistance)
  const smoothEdgeProgress = edgeProgress * edgeProgress * (3 - 2 * edgeProgress)
  return inverseGain * (1 - smoothEdgeProgress)
}

function updateZombieEscapeAudioListener(listenerElements: readonly number[]) {
  if (!Howler.usingWebAudio) return
  Howler.pos(listenerElements[12] ?? 0, listenerElements[13] ?? 0, listenerElements[14] ?? 0)
  Howler.orientation(
    -(listenerElements[8] ?? 0),
    -(listenerElements[9] ?? 0),
    -(listenerElements[10] ?? 1),
    listenerElements[4] ?? 0,
    listenerElements[5] ?? 1,
    listenerElements[6] ?? 0,
  )
}

function createZombieEscapeAudioRuntime(presenceCapacity: number): ZombieEscapeAudioRuntime {
  const byKind: Array<ZombieEscapeAudioCueRuntime | undefined> = []
  const impactByWeapon: Array<ZombieEscapeAudioCueRuntime | undefined> = []
  const shotByWeapon: Array<ZombieEscapeAudioCueRuntime | undefined> = []
  const sounds: Howl[] = []
  const loadState = createZombieEscapeAudioLoadState()
  const presence = createZombieEscapePresenceAudioRuntime(
    ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
    presenceCapacity,
    sounds,
    loadState,
  )
  const runtime: ZombieEscapeAudioRuntime = {
    audioContext: null,
    byKind,
    impactByWeapon,
    loadState,
    presence,
    ready: false,
    shotByWeapon,
    sounds,
  }
  for (const cue of ZOMBIE_ESCAPE_AUDIO_CUES) {
    const cueSounds = cue.files.map((source) => {
      const sound = new Howl(
        createZombieEscapeAudioSoundOptions(
          source,
          cue.playback.maxVoices,
          loadState,
          cue.playback,
        ),
      )
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
    } else if (cue.kind === ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.weaponImpact) {
      impactByWeapon[cue.weaponIndex] = cueRuntime
    } else {
      byKind[cue.kind] = cueRuntime
    }
  }
  runtime.audioContext = Howler.ctx ?? null
  runtime.ready = sounds.every((sound) => sound.state() === 'loaded')
  return runtime
}

function createZombieEscapePresenceAudioRuntime(
  cue: ZombieEscapePresenceAudioCue,
  capacity: number,
  allSounds: Howl[],
  loadState: ZombieEscapeAudioLoadState,
) {
  const sounds = cue.files.map((source) => {
    const sound = new Howl(
      createZombieEscapeAudioSoundOptions(source, cue.playback.maxVoices, loadState, cue.playback),
    )
    allSounds.push(sound)
    return sound
  })
  const ownerSlots = new Int16Array(cue.playback.maxVoices)
  ownerSlots.fill(-1)
  return {
    cue,
    schedule: createZombieEscapePresenceAudioSchedule(capacity),
    sounds,
    voices: {
      ids: new Float64Array(cue.playback.maxVoices),
      ownerGenerations: new Uint32Array(cue.playback.maxVoices),
      ownerSlots,
      pans: new Float32Array(cue.playback.maxVoices),
      sounds: Array.from({ length: cue.playback.maxVoices }, () => null),
      spatialGains: new Float32Array(cue.playback.maxVoices),
      startedAt: new Float64Array(cue.playback.maxVoices),
      volumes: new Float32Array(cue.playback.maxVoices),
    },
  } satisfies ZombieEscapePresenceAudioRuntime
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
  listenerElements: readonly number[],
  spatialMix: ZombieEscapeAudioSpatialMix,
) {
  const kind = events.kind[eventSlot]!
  const subjectIndex = events.subjectIndex[eventSlot]!
  const cueRuntime =
    kind === ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.shotFired
      ? runtime.shotByWeapon[subjectIndex]
      : runtime.byKind[kind]
  if (!cueRuntime) return
  playZombieEscapeAudioCueRuntime(
    cueRuntime,
    sequence,
    now,
    volumeScale,
    events.x[eventSlot]! + originX,
    events.y[eventSlot]! + originY,
    events.z[eventSlot]! + originZ,
    listenerElements,
    spatialMix,
  )
}

function playZombieEscapeAudioCueRuntime(
  cueRuntime: ZombieEscapeAudioCueRuntime,
  sequence: number,
  now: number,
  volumeScale: number,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
  listenerElements: readonly number[],
  spatialMix: ZombieEscapeAudioSpatialMix,
) {
  if (now - cueRuntime.lastPlayedAt < cueRuntime.cue.playback.minIntervalMs) return

  const variation = cueRuntime.nextVariation % cueRuntime.sounds.length
  cueRuntime.nextVariation += 1
  const sound = cueRuntime.sounds[variation]
  if (sound?.state() !== 'loaded') throw new Error('Zombie Escape audio runtime is not loaded')

  let spatialGain = 1
  let pan = 0
  const playback = cueRuntime.cue.playback
  if (playback.spatial) {
    resolveZombieEscapeAudioSpatialMix(
      sourceX - (listenerElements[12] ?? 0),
      sourceY - (listenerElements[13] ?? 0),
      sourceZ - (listenerElements[14] ?? 0),
      listenerElements[0] ?? 1,
      listenerElements[1] ?? 0,
      listenerElements[2] ?? 0,
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
  if (playback.spatial) {
    if (Howler.usingWebAudio) sound.pos(sourceX, sourceY, sourceZ, id)
    else sound.stereo(pan, id)
  }
  if (Howler.ctx?.state === 'suspended') void Howler.ctx.resume().catch(() => {})
}

function updateZombieEscapePresenceAudio(
  runtime: ZombieEscapePresenceAudioRuntime,
  source: ZombieEscapePresenceAudioSource,
  volumeScale: number,
  originX: number,
  originY: number,
  originZ: number,
  listenerElements: readonly number[],
  spatialMix: ZombieEscapeAudioSpatialMix,
) {
  if (runtime.schedule.audible.length !== source.zombies.pool.capacity) {
    stopZombieEscapePresenceAudioRuntime(runtime)
    runtime.schedule = createZombieEscapePresenceAudioSchedule(source.zombies.pool.capacity)
  }
  const stopDistance = runtime.cue.playback.maxDistance + runtime.cue.schedule.rangeHysteresisMeters
  updateZombieEscapePresenceAudioVoices(
    runtime,
    source,
    volumeScale,
    originX,
    originY,
    originZ,
    listenerElements,
    stopDistance,
    spatialMix,
  )
  const slot = selectZombieEscapePresenceAudioCandidate(
    runtime.schedule,
    source,
    runtime.cue,
    (listenerElements[12] ?? 0) - originX,
    (listenerElements[13] ?? 0) - originY,
    (listenerElements[14] ?? 0) - originZ,
    runtime.voices.ownerSlots,
    runtime.voices.ownerGenerations,
  )
  if (slot < 0) return
  playZombieEscapePresenceAudio(
    runtime,
    source,
    slot,
    volumeScale,
    originX,
    originY,
    originZ,
    listenerElements,
    spatialMix,
  )
}

function updateZombieEscapePresenceAudioVoices(
  runtime: ZombieEscapePresenceAudioRuntime,
  source: ZombieEscapePresenceAudioSource,
  volumeScale: number,
  originX: number,
  originY: number,
  originZ: number,
  listenerElements: readonly number[],
  stopDistance: number,
  spatialMix: ZombieEscapeAudioSpatialMix,
) {
  const voices = runtime.voices
  const stopDistanceSquared = stopDistance ** 2
  for (let voice = 0; voice < voices.sounds.length; voice += 1) {
    const sound = voices.sounds[voice]
    const id = voices.ids[voice]!
    if (!sound) continue
    if (id <= 0 || !sound.playing(id)) {
      clearZombieEscapePresenceVoice(voices, voice, false)
      continue
    }
    const slot = voices.ownerSlots[voice]!
    const validOwner =
      slot >= 0 &&
      slot < source.zombies.pool.capacity &&
      source.zombies.pool.active[slot] !== 0 &&
      source.zombies.pool.generation[slot] === voices.ownerGenerations[voice] &&
      source.zombies.health[slot]! > 0
    if (!validOwner) {
      clearZombieEscapePresenceVoice(voices, voice, true)
      continue
    }
    const sourceX = source.zombies.x[slot]! + originX
    const sourceY = source.zombies.y[slot]! + originY
    const sourceZ = source.zombies.z[slot]! + originZ
    const offsetX = sourceX - (listenerElements[12] ?? 0)
    const offsetY = sourceY - (listenerElements[13] ?? 0)
    const offsetZ = sourceZ - (listenerElements[14] ?? 0)
    if (offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ >= stopDistanceSquared) {
      clearZombieEscapePresenceVoice(voices, voice, true)
      continue
    }
    resolveZombieEscapePresenceAudioSpatialMix(
      offsetX,
      offsetY,
      offsetZ,
      listenerElements[0] ?? 1,
      listenerElements[2] ?? 0,
      runtime.cue.playback.referenceDistance,
      stopDistance,
      spatialMix,
    )
    const volume = runtime.cue.playback.volume * volumeScale * spatialMix.gain
    if (Math.abs(volume - voices.volumes[voice]!) > PRESENCE_MIX_EPSILON) {
      sound.volume(volume, id)
      voices.volumes[voice] = volume
    }
    if (Howler.usingWebAudio) {
      sound.pos(sourceX, sourceY, sourceZ, id)
    } else if (Math.abs(spatialMix.pan - voices.pans[voice]!) > PRESENCE_MIX_EPSILON) {
      sound.stereo(spatialMix.pan, id)
      voices.pans[voice] = spatialMix.pan
    }
    voices.spatialGains[voice] = spatialMix.gain
  }
}

function playZombieEscapePresenceAudio(
  runtime: ZombieEscapePresenceAudioRuntime,
  source: ZombieEscapePresenceAudioSource,
  slot: number,
  volumeScale: number,
  originX: number,
  originY: number,
  originZ: number,
  listenerElements: readonly number[],
  spatialMix: ZombieEscapeAudioSpatialMix,
) {
  const generation = source.zombies.pool.generation[slot]!
  const ordinal = runtime.schedule.utteranceOrdinal[slot]!
  const variation = resolveZombieEscapePresenceVariation(
    source.seed,
    slot,
    generation,
    ordinal,
    runtime.sounds.length,
  )
  const sound = runtime.sounds[variation]
  if (sound?.state() !== 'loaded') throw new Error('Zombie presence audio is not loaded')
  const sourceX = source.zombies.x[slot]! + originX
  const sourceY = source.zombies.y[slot]! + originY
  const sourceZ = source.zombies.z[slot]! + originZ
  const offsetX = sourceX - (listenerElements[12] ?? 0)
  const offsetY = sourceY - (listenerElements[13] ?? 0)
  const offsetZ = sourceZ - (listenerElements[14] ?? 0)
  const stopDistance = runtime.cue.playback.maxDistance + runtime.cue.schedule.rangeHysteresisMeters
  resolveZombieEscapePresenceAudioSpatialMix(
    offsetX,
    offsetY,
    offsetZ,
    listenerElements[0] ?? 1,
    listenerElements[2] ?? 0,
    runtime.cue.playback.referenceDistance,
    stopDistance,
    spatialMix,
  )
  if (spatialMix.gain <= 0) return
  const voice = acquireZombieEscapePresenceVoice(runtime.voices)
  clearZombieEscapePresenceVoice(runtime.voices, voice, true)
  const id = sound.play()
  const rateUnit = resolveZombieEscapePresenceHash(
    source.seed,
    slot,
    generation,
    ordinal,
    PRESENCE_RATE_SALT,
  )
  const [minimumRate, maximumRate] = runtime.cue.playback.rateRange
  const volume = runtime.cue.playback.volume * volumeScale * spatialMix.gain
  sound.rate(minimumRate + (maximumRate - minimumRate) * rateUnit, id)
  sound.volume(volume, id)
  if (Howler.usingWebAudio) sound.pos(sourceX, sourceY, sourceZ, id)
  else sound.stereo(spatialMix.pan, id)
  runtime.voices.ids[voice] = id
  runtime.voices.ownerGenerations[voice] = generation
  runtime.voices.ownerSlots[voice] = slot
  runtime.voices.pans[voice] = spatialMix.pan
  runtime.voices.sounds[voice] = sound
  runtime.voices.spatialGains[voice] = spatialMix.gain
  runtime.voices.startedAt[voice] = source.elapsedSeconds
  runtime.voices.volumes[voice] = volume
  commitZombieEscapePresenceAudioStart(runtime.schedule, source, runtime.cue, slot)
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

function acquireZombieEscapePresenceVoice(voices: ZombieEscapePresenceAudioVoicePool) {
  let quietest = 0
  for (let voice = 0; voice < voices.sounds.length; voice += 1) {
    if (!voices.sounds[voice]) return voice
    if (
      voices.spatialGains[voice]! < voices.spatialGains[quietest]! ||
      (voices.spatialGains[voice] === voices.spatialGains[quietest] &&
        voices.startedAt[voice]! < voices.startedAt[quietest]!)
    ) {
      quietest = voice
    }
  }
  return quietest
}

function clearZombieEscapePresenceVoice(
  voices: ZombieEscapePresenceAudioVoicePool,
  voice: number,
  stop: boolean,
) {
  const sound = voices.sounds[voice]
  const id = voices.ids[voice]!
  if (stop && sound && id > 0) {
    try {
      if (sound.playing(id)) sound.stop(id)
    } catch {}
  }
  voices.ids[voice] = 0
  voices.ownerGenerations[voice] = 0
  voices.ownerSlots[voice] = -1
  voices.pans[voice] = 0
  voices.sounds[voice] = null
  voices.spatialGains[voice] = 0
  voices.startedAt[voice] = 0
  voices.volumes[voice] = 0
}

function stopZombieEscapePresenceAudioRuntime(runtime: ZombieEscapePresenceAudioRuntime) {
  if (!runtime.schedule.enabled && !runtime.voices.sounds.some(Boolean)) return
  for (let voice = 0; voice < runtime.voices.sounds.length; voice += 1) {
    clearZombieEscapePresenceVoice(runtime.voices, voice, true)
  }
  resetZombieEscapePresenceAudioSchedule(runtime.schedule)
}

function stopZombieEscapeAudioRuntime(runtime: ZombieEscapeAudioRuntime) {
  for (const sound of runtime.sounds) {
    try {
      sound.stop()
    } catch {}
  }
  for (let voice = 0; voice < runtime.presence.voices.sounds.length; voice += 1) {
    clearZombieEscapePresenceVoice(runtime.presence.voices, voice, false)
  }
  resetZombieEscapePresenceAudioSchedule(runtime.presence.schedule)
}

function disposeZombieEscapeAudioRuntime(runtime: ZombieEscapeAudioRuntime) {
  for (const sound of runtime.sounds) {
    try {
      sound.unload()
    } catch {}
  }
  for (let voice = 0; voice < runtime.presence.voices.sounds.length; voice += 1) {
    clearZombieEscapePresenceVoice(runtime.presence.voices, voice, false)
  }
  resetZombieEscapePresenceAudioSchedule(runtime.presence.schedule)
}

function resolveZombieEscapePresenceCapacity(source: ZombieEscapeAudioEventSource) {
  return isZombieEscapePresenceAudioSource(source) ? source.zombies.pool.capacity : 1
}

function isZombieEscapePresenceAudioSource(
  source: ZombieEscapeAudioEventSource,
): source is ZombieEscapeAudioEventSource & ZombieEscapePresenceAudioSource {
  return (
    typeof source.elapsedSeconds === 'number' &&
    typeof source.paused === 'boolean' &&
    (source.phase === 'build' || source.phase === 'night') &&
    (source.status === 'lost' || source.status === 'playing' || source.status === 'won') &&
    typeof source.seed === 'number' &&
    source.player !== undefined &&
    source.zombies !== undefined
  )
}

function isZombieEscapePresenceVoiceOwned(
  ownerSlots: Int16Array,
  ownerGenerations: Uint32Array,
  slot: number,
  generation: number,
) {
  for (let voice = 0; voice < ownerSlots.length; voice += 1) {
    if (ownerSlots[voice] === slot && ownerGenerations[voice] === generation) return true
  }
  return false
}

function resolveZombieEscapePresenceHash(
  seed: number,
  slot: number,
  generation: number,
  ordinal: number,
  salt: number,
) {
  let value =
    (seed >>> 0) ^
    Math.imul((slot + 1) >>> 0, 0x9e37_79b1) ^
    Math.imul(generation >>> 0, 0x85eb_ca77) ^
    Math.imul((ordinal + 1) >>> 0, 0xc2b2_ae3d) ^
    (salt >>> 0)
  value ^= value >>> 16
  value = Math.imul(value, 0x7feb_352d)
  value ^= value >>> 15
  value = Math.imul(value, 0x846c_a68b)
  value ^= value >>> 16
  return (value >>> 0) * HASH_SCALE
}
