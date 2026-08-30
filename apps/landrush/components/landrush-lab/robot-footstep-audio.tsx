'use client'

import { useAudio } from '@pascal-app/editor'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import {
  AudioListener,
  AudioLoader,
  type Camera,
  type Group,
  MathUtils,
  PositionalAudio,
  Audio as ThreeAudio,
  type Vector3,
} from 'three'

const FOOTSTEP_LEFT_URLS = [
  '/audios/sfx/footsteps/sand-l1.ogg',
  '/audios/sfx/footsteps/sand-l2.ogg',
  '/audios/sfx/footsteps/sand-l3.ogg',
  '/audios/sfx/footsteps/stone-l1.ogg',
  '/audios/sfx/footsteps/stone-l2.ogg',
  '/audios/sfx/footsteps/stone-l3.ogg',
] as const
const FOOTSTEP_RIGHT_URLS = [
  '/audios/sfx/footsteps/sand-r1.ogg',
  '/audios/sfx/footsteps/sand-r2.ogg',
  '/audios/sfx/footsteps/sand-r3.ogg',
  '/audios/sfx/footsteps/stone-r1.ogg',
  '/audios/sfx/footsteps/stone-r2.ogg',
  '/audios/sfx/footsteps/stone-r3.ogg',
] as const
const FOOTSTEP_POOL_SIZE = 5
const FOOTSTEP_MIN_SPEED = 0.22
const FOOTSTEP_WALK_STRIDE_METERS = 0.74
const FOOTSTEP_RUN_STRIDE_METERS = 1.08
const FOOTSTEP_LATERAL_OFFSET_METERS = 0.23
const FOOTSTEP_FORWARD_OFFSET_METERS = 0.08
const FOOTSTEP_HEIGHT_METERS = 0.08
export const ROBOT_FOOTSTEP_BASE_VOLUME = 0.24
const FOOTSTEP_REF_DISTANCE = 5.2
const FOOTSTEP_MAX_DISTANCE = 22
const FOOTSTEP_ROLLOFF = 0.8
const FOOTSTEP_WALK_PLAYBACK_SPEED = 2.2
const FOOTSTEP_RUN_PLAYBACK_SPEED = 1
const JUMP_AUDIO_MAX_RETRYABLE_PLAY_FAILURES = 2
export const ROBOT_JUMP_AUDIO_PENDING_TTL_SECONDS = 0.45
const EMPTY_JUMP_AUDIO_BUFFERS: readonly AudioBuffer[] = []

export type RobotFootstepMotion = {
  grounded: boolean
  heading: number
  isMoving: boolean
  position: Vector3
  speed: number
  supportY: number
}

export type RobotJumpAudioCue = {
  files: readonly string[]
  playback: {
    maxDistance?: number
    maxVoices: number
    minIntervalMs: number
    rateRange: readonly [number, number]
    referenceDistance?: number
    spatial: boolean
    volume: number
  }
}

type FootstepBuffers = {
  left: AudioBuffer[]
  right: AudioBuffer[]
}

export type RobotJumpAudioBufferStatus = 'failed' | 'loading' | 'ready' | 'unavailable'

export type RobotJumpAudioPlaybackDisposition = 'play' | 'retry' | 'terminal'

export type RobotJumpAudioPlaybackState = {
  acknowledgedSequence: number
  pendingSequence: number | null
  pendingSinceSeconds: number | null
  retryablePlayFailureCount: number
}

export type RobotJumpAudioPlaybackAdvanceResult = 'none' | 'pending' | 'played' | 'terminal'

export type RobotJumpAudioPlayResult = 'played' | 'retry' | 'terminal'

type JumpAudioBufferLoadState = {
  buffers: readonly AudioBuffer[]
  filesKey: string
  status: RobotJumpAudioBufferStatus
}

type FootstepRuntime = {
  distance: number
  jumpPoolIndex: number
  jumpPlayback: RobotJumpAudioPlaybackState
  lastJumpPlayedAtSeconds: number
  lastLeftIndex: number
  lastRightIndex: number
  nextLeft: boolean
  poolIndex: number
  wasMoving: boolean
}

export function LandrushRobotFootstepAudio({
  enabled = true,
  jumpAudioCue,
  jumpSequenceRef,
  motionRef,
  runSpeed,
  walkSpeed,
}: {
  enabled?: boolean
  jumpAudioCue?: RobotJumpAudioCue
  jumpSequenceRef?: { readonly current: number }
  motionRef: { readonly current: RobotFootstepMotion | null }
  runSpeed: number
  walkSpeed: number
}) {
  const camera = useThree((state) => state.camera)
  const [listener, setListener] = useState<AudioListener | null>(null)
  const audioGroupRef = useRef<Group>(null!)
  const audioPoolRef = useRef<PositionalAudio[]>([])
  const jumpAudioPoolRef = useRef<(PositionalAudio | ThreeAudio)[]>([])
  const jumpAudioPoolCueRef = useRef<RobotJumpAudioCue | null>(null)
  const runtimeRef = useRef<FootstepRuntime>({
    distance: 0,
    jumpPoolIndex: 0,
    jumpPlayback: createRobotJumpAudioPlaybackState(jumpSequenceRef?.current ?? 0),
    lastJumpPlayedAtSeconds: Number.NEGATIVE_INFINITY,
    lastLeftIndex: -1,
    lastRightIndex: -1,
    nextLeft: true,
    poolIndex: 0,
    wasMoving: false,
  })
  const [buffers, setBuffers] = useState<FootstepBuffers | null>(null)
  const jumpAudioFilesKey = resolveJumpAudioFilesKey(jumpAudioCue)
  const jumpAudioCueConfigurationValid = isRobotJumpAudioCueConfigurationValid(jumpAudioCue)
  const [jumpBufferLoad, setJumpBufferLoad] = useState<JumpAudioBufferLoadState>(() => ({
    buffers: EMPTY_JUMP_AUDIO_BUFFERS,
    filesKey: jumpAudioFilesKey,
    status: shouldLoadRobotJumpAudioCue(jumpAudioCue) ? 'loading' : 'unavailable',
  }))
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const masterVolume = useAudio((state) => state.masterVolume)
  const muted = useAudio((state) => state.muted)
  const sfxVolume = useAudio((state) => state.sfxVolume)

  useEffect(() => {
    setListener(new AudioListener())
  }, [])

  useEffect(() => {
    let active = true
    const filesKey = resolveJumpAudioFilesKey(jumpAudioCue)
    if (!shouldLoadRobotJumpAudioCue(jumpAudioCue)) {
      setJumpBufferLoad({
        buffers: EMPTY_JUMP_AUDIO_BUFFERS,
        filesKey,
        status: 'unavailable',
      })
      return () => {
        active = false
      }
    }

    setJumpBufferLoad({ buffers: EMPTY_JUMP_AUDIO_BUFFERS, filesKey, status: 'loading' })

    const loader = new AudioLoader()
    const loadBuffer = (url: string) =>
      new Promise<AudioBuffer>((resolve, reject) => {
        loader.load(url, resolve, undefined, reject)
      })

    Promise.allSettled(jumpAudioCue.files.map(loadBuffer)).then((results) => {
      if (!active) return
      const loadedBuffers = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      )
      setJumpBufferLoad({
        buffers: loadedBuffers,
        filesKey,
        status: loadedBuffers.length > 0 ? 'ready' : 'failed',
      })
      if (loadedBuffers.length < results.length) {
        console.warn('[landrush] One or more robot jump audio variants failed to load.')
      }
    })

    return () => {
      active = false
    }
  }, [jumpAudioCue])

  useEffect(() => {
    if (!listener) return
    camera.add(listener)
    return () => {
      camera.remove(listener)
    }
  }, [camera, listener])

  useEffect(() => {
    if (!listener) return

    let active = true
    let resumeInFlight = false
    const context = listener.context
    const syncAudioState = () => {
      if (!active) return
      const running = context.state === 'running'
      setAudioUnlocked(running)
    }
    const unlockAudio = () => {
      if (context.state === 'running') {
        syncAudioState()
        return
      }
      if (resumeInFlight) return
      resumeInFlight = true
      void context
        .resume()
        .then(syncAudioState)
        .catch(() => {})
        .finally(() => {
          resumeInFlight = false
        })
    }

    syncAudioState()
    context.addEventListener('statechange', syncAudioState)
    window.addEventListener('pointerdown', unlockAudio, { passive: true })
    window.addEventListener('touchstart', unlockAudio, { passive: true })
    window.addEventListener('keydown', unlockAudio)
    return () => {
      active = false
      context.removeEventListener('statechange', syncAudioState)
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('touchstart', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
  }, [listener])

  useEffect(() => {
    let active = true
    const loader = new AudioLoader()
    const loadBuffer = (url: string) =>
      new Promise<AudioBuffer>((resolve, reject) => {
        loader.load(url, resolve, undefined, reject)
      })

    Promise.all([
      Promise.all(FOOTSTEP_LEFT_URLS.map(loadBuffer)),
      Promise.all(FOOTSTEP_RIGHT_URLS.map(loadBuffer)),
    ])
      .then(([left, right]) => {
        if (active) setBuffers({ left, right })
      })
      .catch(() => {
        if (active) setBuffers(null)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!listener) return

    const audioGroup = audioGroupRef.current
    const pool = Array.from({ length: FOOTSTEP_POOL_SIZE }, () => {
      const audio = new PositionalAudio(listener)
      audio.setDistanceModel('inverse')
      audio.setRefDistance(FOOTSTEP_REF_DISTANCE)
      audio.setMaxDistance(FOOTSTEP_MAX_DISTANCE)
      audio.setRolloffFactor(FOOTSTEP_ROLLOFF)
      audio.setLoop(false)
      audioGroup.add(audio)
      return audio
    })

    audioPoolRef.current = pool
    return () => {
      for (const audio of pool) {
        if (audio.isPlaying) audio.stop()
        audio.disconnect()
        audioGroup.remove(audio)
      }
      audioPoolRef.current = []
    }
  }, [listener])

  useEffect(() => {
    jumpAudioPoolCueRef.current = null
    if (!(listener && jumpAudioCue && isRobotJumpAudioCueConfigurationValid(jumpAudioCue))) return

    const audioGroup = audioGroupRef.current
    const voiceCount = Math.max(1, Math.min(8, Math.trunc(jumpAudioCue.playback.maxVoices)))
    const pool = Array.from({ length: voiceCount }, () => {
      const audio = jumpAudioCue.playback.spatial
        ? new PositionalAudio(listener)
        : new ThreeAudio(listener)
      if (audio instanceof PositionalAudio) {
        audio.setDistanceModel('inverse')
        audio.setRefDistance(jumpAudioCue.playback.referenceDistance ?? FOOTSTEP_REF_DISTANCE)
        audio.setMaxDistance(jumpAudioCue.playback.maxDistance ?? FOOTSTEP_MAX_DISTANCE)
        audio.setRolloffFactor(FOOTSTEP_ROLLOFF)
      }
      audio.setLoop(false)
      audioGroup.add(audio)
      return audio
    })

    jumpAudioPoolRef.current = pool
    jumpAudioPoolCueRef.current = jumpAudioCue
    return () => {
      for (const audio of pool) {
        if (audio.isPlaying) audio.stop()
        audio.disconnect()
        audioGroup.remove(audio)
      }
      jumpAudioPoolRef.current = []
      if (jumpAudioPoolCueRef.current === jumpAudioCue) jumpAudioPoolCueRef.current = null
    }
  }, [jumpAudioCue, listener])

  useFrame((state, delta) => {
    const runtime = runtimeRef.current
    const pool = audioPoolRef.current
    const jumpPool = jumpAudioPoolRef.current
    const motion = motionRef.current
    if (listener && motion) {
      resolveRobotAudioListenerLocalPosition(camera, motion.position, listener.position)
      listener.updateMatrixWorld()
    }
    const volumeScale = muted ? 0 : (masterVolume / 100) * (sfxVolume / 100)
    const audioContextRunning = listener?.context.state === 'running'

    const currentJumpBufferLoad =
      jumpBufferLoad.filesKey === jumpAudioFilesKey
        ? jumpBufferLoad
        : {
            buffers: EMPTY_JUMP_AUDIO_BUFFERS,
            filesKey: jumpAudioFilesKey,
            status: 'loading' as const,
          }
    const jumpPlaybackResult = advanceRobotJumpAudioPlaybackState(runtime.jumpPlayback, {
      disposition: resolveRobotJumpAudioPlaybackDisposition({
        audioRunning: audioContextRunning,
        audible: volumeScale > 0,
        bufferStatus: currentJumpBufferLoad.status,
        enabled,
        hasCue: Boolean(jumpAudioCue && jumpAudioCueConfigurationValid),
        hasMotion: Boolean(motion),
        hasPool: jumpAudioPoolCueRef.current === jumpAudioCue && jumpPool.length > 0,
        intervalElapsed: Boolean(
          jumpAudioCue &&
            state.clock.elapsedTime - runtime.lastJumpPlayedAtSeconds >=
              jumpAudioCue.playback.minIntervalMs / 1_000,
        ),
      }),
      nowSeconds: state.clock.elapsedTime,
      observedSequence: jumpSequenceRef?.current ?? runtime.jumpPlayback.acknowledgedSequence,
      play: (sequence) => {
        if (!(jumpAudioCue && motion)) return 'retry'
        return playJump({
          buffers: currentJumpBufferLoad.buffers,
          cue: jumpAudioCue,
          motion,
          pool: jumpPool,
          runtime,
          sequence,
          volumeScale,
        })
      },
    })
    if (jumpPlaybackResult === 'played') {
      runtime.lastJumpPlayedAtSeconds = state.clock.elapsedTime
    }

    if (
      !enabled ||
      !motion ||
      !buffers ||
      !audioUnlocked ||
      volumeScale <= 0 ||
      pool.length === 0
    ) {
      runtime.distance = 0
      runtime.wasMoving = false
      return
    }

    const speed = Math.max(0, motion.speed)
    const moving = motion.grounded && motion.isMoving && speed > FOOTSTEP_MIN_SPEED
    if (!moving) {
      runtime.distance = 0
      runtime.wasMoving = false
      return
    }

    const runBlend = MathUtils.clamp(
      (speed - walkSpeed) / Math.max(0.001, runSpeed - walkSpeed),
      0,
      1,
    )
    const stride = MathUtils.lerp(FOOTSTEP_WALK_STRIDE_METERS, FOOTSTEP_RUN_STRIDE_METERS, runBlend)
    if (!runtime.wasMoving) {
      runtime.distance = stride * 0.58
      runtime.wasMoving = true
    }
    runtime.distance += speed * Math.max(0.001, Math.min(delta, 0.05))
    if (runtime.distance < stride) return

    runtime.distance -= stride
    playFootstep({
      buffers,
      motion,
      pool,
      runBlend,
      runtime,
      volumeScale,
    })
  })

  return <group ref={audioGroupRef} />
}

function playJump({
  buffers,
  cue,
  motion,
  pool,
  runtime,
  sequence,
  volumeScale,
}: {
  buffers: readonly AudioBuffer[]
  cue: RobotJumpAudioCue
  motion: RobotFootstepMotion
  pool: readonly (PositionalAudio | ThreeAudio)[]
  runtime: FootstepRuntime
  sequence: number
  volumeScale: number
}): RobotJumpAudioPlayResult {
  if (!isRobotJumpAudioCueConfigurationValid(cue)) return 'terminal'
  const audio = pool[runtime.jumpPoolIndex % pool.length]
  const buffer = buffers[Math.abs(sequence - 1) % buffers.length]
  if (!(audio && buffer)) return 'retry'

  const [minimumRate, maximumRate] = cue.playback.rateRange

  try {
    if (audio.isPlaying) audio.stop()
    audio.setBuffer(buffer)
    const rateProgress = hashAudioSequence(sequence)
    audio.setPlaybackRate(MathUtils.lerp(minimumRate, maximumRate, rateProgress))
    audio.setVolume(cue.playback.volume * volumeScale)
    if (audio instanceof PositionalAudio) audio.position.copy(motion.position)
    audio.updateMatrixWorld()
    audio.play()
    if (!audio.isPlaying) return 'retry'
    runtime.jumpPoolIndex += 1
    return 'played'
  } catch {
    return 'retry'
  }
}

export function createRobotJumpAudioPlaybackState(
  acknowledgedSequence = 0,
): RobotJumpAudioPlaybackState {
  return {
    acknowledgedSequence: normalizeJumpAudioSequence(acknowledgedSequence),
    pendingSequence: null,
    pendingSinceSeconds: null,
    retryablePlayFailureCount: 0,
  }
}

export function advanceRobotJumpAudioPlaybackState(
  state: RobotJumpAudioPlaybackState,
  {
    disposition,
    nowSeconds,
    observedSequence,
    play,
  }: {
    disposition: RobotJumpAudioPlaybackDisposition
    nowSeconds: number
    observedSequence: number
    play: (sequence: number) => RobotJumpAudioPlayResult
  },
): RobotJumpAudioPlaybackAdvanceResult {
  const observed = normalizeJumpAudioSequence(observedSequence)
  const now = normalizeJumpAudioClockSeconds(nowSeconds)
  if (
    observed > state.acknowledgedSequence &&
    (state.pendingSequence === null || observed > state.pendingSequence)
  ) {
    state.pendingSequence = observed
    state.pendingSinceSeconds = now
    state.retryablePlayFailureCount = 0
  }

  const pending = state.pendingSequence
  if (pending === null) return 'none'
  if (
    state.pendingSinceSeconds !== null &&
    now - state.pendingSinceSeconds >= ROBOT_JUMP_AUDIO_PENDING_TTL_SECONDS
  ) {
    acknowledgeRobotJumpAudioSequence(state, pending)
    return 'terminal'
  }
  if (disposition === 'retry') return 'pending'
  if (disposition === 'terminal') {
    acknowledgeRobotJumpAudioSequence(state, pending)
    return 'terminal'
  }

  const playResult = play(pending)
  if (playResult === 'retry') {
    state.retryablePlayFailureCount += 1
    if (state.retryablePlayFailureCount <= JUMP_AUDIO_MAX_RETRYABLE_PLAY_FAILURES) {
      return 'pending'
    }
  }
  acknowledgeRobotJumpAudioSequence(state, pending)
  return playResult === 'played' ? 'played' : 'terminal'
}

export function resolveRobotJumpAudioPlaybackDisposition({
  audioRunning,
  audible,
  bufferStatus,
  enabled,
  hasCue,
  hasMotion,
  hasPool,
  intervalElapsed,
}: {
  audioRunning: boolean
  audible: boolean
  bufferStatus: RobotJumpAudioBufferStatus
  enabled: boolean
  hasCue: boolean
  hasMotion: boolean
  hasPool: boolean
  intervalElapsed: boolean
}): RobotJumpAudioPlaybackDisposition {
  if (
    !enabled ||
    !audible ||
    !hasCue ||
    !hasMotion ||
    bufferStatus === 'failed' ||
    bufferStatus === 'unavailable'
  ) {
    return 'terminal'
  }
  if (!audioRunning || !hasPool || bufferStatus === 'loading') return 'retry'
  return intervalElapsed ? 'play' : 'terminal'
}

export function isRobotJumpAudioCueConfigurationValid(cue: RobotJumpAudioCue | undefined) {
  if (!cue || cue.files.length === 0) return false
  const { maxDistance, maxVoices, minIntervalMs, rateRange, referenceDistance, volume } =
    cue.playback
  const [minimumRate, maximumRate] = rateRange
  return (
    Number.isFinite(maxVoices) &&
    maxVoices >= 1 &&
    Number.isFinite(minIntervalMs) &&
    minIntervalMs >= 0 &&
    Number.isFinite(minimumRate) &&
    minimumRate > 0 &&
    Number.isFinite(maximumRate) &&
    maximumRate >= minimumRate &&
    Number.isFinite(volume) &&
    volume >= 0 &&
    (referenceDistance === undefined ||
      (Number.isFinite(referenceDistance) && referenceDistance > 0)) &&
    (maxDistance === undefined || (Number.isFinite(maxDistance) && maxDistance > 0)) &&
    (referenceDistance === undefined ||
      maxDistance === undefined ||
      maxDistance >= referenceDistance)
  )
}

export function shouldLoadRobotJumpAudioCue(
  cue: RobotJumpAudioCue | undefined,
): cue is RobotJumpAudioCue {
  return isRobotJumpAudioCueConfigurationValid(cue)
}

function acknowledgeRobotJumpAudioSequence(state: RobotJumpAudioPlaybackState, sequence: number) {
  state.acknowledgedSequence = Math.max(state.acknowledgedSequence, sequence)
  if (state.pendingSequence !== null && state.pendingSequence <= state.acknowledgedSequence) {
    state.pendingSequence = null
    state.pendingSinceSeconds = null
    state.retryablePlayFailureCount = 0
  }
}

function normalizeJumpAudioSequence(sequence: number) {
  return Number.isFinite(sequence) ? Math.max(0, Math.trunc(sequence)) : 0
}

function normalizeJumpAudioClockSeconds(seconds: number) {
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0
}

function resolveJumpAudioFilesKey(cue: RobotJumpAudioCue | undefined) {
  return cue?.files.join('\u0000') ?? ''
}

function hashAudioSequence(sequence: number) {
  let value = Math.trunc(sequence) >>> 0
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d)
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b)
  value ^= value >>> 16
  return (value >>> 0) / 4_294_967_296
}

function playFootstep({
  buffers,
  motion,
  pool,
  runBlend,
  runtime,
  volumeScale,
}: {
  buffers: FootstepBuffers
  motion: RobotFootstepMotion
  pool: PositionalAudio[]
  runBlend: number
  runtime: FootstepRuntime
  volumeScale: number
}) {
  const leftStep = runtime.nextLeft
  runtime.nextLeft = !runtime.nextLeft

  const sideBuffers = leftStep ? buffers.left : buffers.right
  if (sideBuffers.length === 0) return

  const { buffer, index } = pickFootstepBuffer(
    sideBuffers,
    leftStep ? runtime.lastLeftIndex : runtime.lastRightIndex,
  )
  if (leftStep) {
    runtime.lastLeftIndex = index
  } else {
    runtime.lastRightIndex = index
  }

  const audio = pool[runtime.poolIndex++ % pool.length]
  if (!audio || !buffer) return

  if (audio.isPlaying) audio.stop()
  audio.setBuffer(buffer)
  audio.setPlaybackRate(
    MathUtils.lerp(0.94, 1.08, runBlend) *
      MathUtils.lerp(FOOTSTEP_WALK_PLAYBACK_SPEED, FOOTSTEP_RUN_PLAYBACK_SPEED, runBlend) *
      MathUtils.randFloat(0.96, 1.04),
  )
  audio.setVolume(resolveRobotFootstepVolume(volumeScale, runBlend, MathUtils.randFloat(0.86, 1)))

  const side = leftStep ? -1 : 1
  const rightX = Math.cos(motion.heading)
  const rightZ = -Math.sin(motion.heading)
  const forwardX = Math.sin(motion.heading)
  const forwardZ = Math.cos(motion.heading)
  audio.position.set(
    motion.position.x +
      rightX * FOOTSTEP_LATERAL_OFFSET_METERS * side +
      forwardX * FOOTSTEP_FORWARD_OFFSET_METERS,
    motion.supportY + FOOTSTEP_HEIGHT_METERS,
    motion.position.z +
      rightZ * FOOTSTEP_LATERAL_OFFSET_METERS * side +
      forwardZ * FOOTSTEP_FORWARD_OFFSET_METERS,
  )
  audio.updateMatrixWorld()
  audio.play()
}

export function resolveRobotAudioListenerLocalPosition(
  camera: Camera,
  playerWorldPosition: Vector3,
  output: Vector3,
) {
  return camera.worldToLocal(output.copy(playerWorldPosition))
}

export function resolveRobotFootstepVolume(volumeScale: number, runBlend: number, variation = 1) {
  return (
    ROBOT_FOOTSTEP_BASE_VOLUME *
    Math.max(0, volumeScale) *
    MathUtils.lerp(0.72, 1, MathUtils.clamp(runBlend, 0, 1)) *
    MathUtils.clamp(variation, 0, 1)
  )
}

function pickFootstepBuffer(buffers: readonly AudioBuffer[], lastIndex: number) {
  if (buffers.length === 1) return { buffer: buffers[0], index: 0 }

  const randomIndex = MathUtils.randInt(0, buffers.length - 2)
  const index = lastIndex >= 0 && randomIndex >= lastIndex ? randomIndex + 1 : randomIndex
  return { buffer: buffers[index], index }
}
