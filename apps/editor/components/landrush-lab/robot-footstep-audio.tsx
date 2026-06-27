'use client'

import { useAudio } from '@pascal-app/editor'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import {
  AudioListener,
  AudioLoader,
  type Group,
  MathUtils,
  PositionalAudio,
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
const FOOTSTEP_BASE_VOLUME = 0.033
const FOOTSTEP_REF_DISTANCE = 5.2
const FOOTSTEP_MAX_DISTANCE = 22
const FOOTSTEP_ROLLOFF = 0.8
const FOOTSTEP_WALK_PLAYBACK_SPEED = 2.2
const FOOTSTEP_RUN_PLAYBACK_SPEED = 1

export type RobotFootstepMotion = {
  heading: number
  isMoving: boolean
  position: Vector3
  speed: number
}

type FootstepBuffers = {
  left: AudioBuffer[]
  right: AudioBuffer[]
}

type FootstepRuntime = {
  distance: number
  lastLeftIndex: number
  lastRightIndex: number
  nextLeft: boolean
  poolIndex: number
  wasMoving: boolean
}

export function LandrushRobotFootstepAudio({
  enabled = true,
  groundY,
  motionRef,
  runSpeed,
  walkSpeed,
}: {
  enabled?: boolean
  groundY: number
  motionRef: { readonly current: RobotFootstepMotion | null }
  runSpeed: number
  walkSpeed: number
}) {
  const camera = useThree((state) => state.camera)
  const [listener, setListener] = useState<AudioListener | null>(null)
  const audioGroupRef = useRef<Group>(null!)
  const audioPoolRef = useRef<PositionalAudio[]>([])
  const runtimeRef = useRef<FootstepRuntime>({
    distance: 0,
    lastLeftIndex: -1,
    lastRightIndex: -1,
    nextLeft: true,
    poolIndex: 0,
    wasMoving: false,
  })
  const [buffers, setBuffers] = useState<FootstepBuffers | null>(null)
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const masterVolume = useAudio((state) => state.masterVolume)
  const muted = useAudio((state) => state.muted)
  const sfxVolume = useAudio((state) => state.sfxVolume)

  useEffect(() => {
    setListener(new AudioListener())
  }, [])

  useEffect(() => {
    if (!listener) return
    camera.add(listener)
    return () => {
      camera.remove(listener)
    }
  }, [camera, listener])

  useEffect(() => {
    if (!listener) return

    const unlockAudio = () => {
      const context = listener.context
      if (context.state === 'running') {
        setAudioUnlocked(true)
        return
      }
      void context
        .resume()
        .then(() => setAudioUnlocked(context.state === 'running'))
        .catch(() => {})
    }

    unlockAudio()
    window.addEventListener('pointerdown', unlockAudio, { passive: true })
    window.addEventListener('touchstart', unlockAudio, { passive: true })
    window.addEventListener('keydown', unlockAudio)
    return () => {
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

  useFrame((_, delta) => {
    const runtime = runtimeRef.current
    const pool = audioPoolRef.current
    const motion = motionRef.current
    const volumeScale = muted ? 0 : (masterVolume / 100) * (sfxVolume / 100)

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
    const moving = motion.isMoving && speed > FOOTSTEP_MIN_SPEED
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
      groundY,
      motion,
      pool,
      runBlend,
      runtime,
      volumeScale,
    })
  })

  return <group ref={audioGroupRef} />
}

function playFootstep({
  buffers,
  groundY,
  motion,
  pool,
  runBlend,
  runtime,
  volumeScale,
}: {
  buffers: FootstepBuffers
  groundY: number
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
  audio.setVolume(
    FOOTSTEP_BASE_VOLUME *
      volumeScale *
      MathUtils.lerp(0.72, 1, runBlend) *
      MathUtils.randFloat(0.86, 1),
  )

  const side = leftStep ? -1 : 1
  const rightX = Math.cos(motion.heading)
  const rightZ = -Math.sin(motion.heading)
  const forwardX = Math.sin(motion.heading)
  const forwardZ = Math.cos(motion.heading)
  audio.position.set(
    motion.position.x +
      rightX * FOOTSTEP_LATERAL_OFFSET_METERS * side +
      forwardX * FOOTSTEP_FORWARD_OFFSET_METERS,
    groundY + FOOTSTEP_HEIGHT_METERS,
    motion.position.z +
      rightZ * FOOTSTEP_LATERAL_OFFSET_METERS * side +
      forwardZ * FOOTSTEP_FORWARD_OFFSET_METERS,
  )
  audio.updateMatrixWorld()
  audio.play()
}

function pickFootstepBuffer(buffers: readonly AudioBuffer[], lastIndex: number) {
  if (buffers.length === 1) return { buffer: buffers[0], index: 0 }

  const randomIndex = MathUtils.randInt(0, buffers.length - 2)
  const index = lastIndex >= 0 && randomIndex >= lastIndex ? randomIndex + 1 : randomIndex
  return { buffer: buffers[index], index }
}
