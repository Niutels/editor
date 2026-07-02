'use client'

import { Mic, MicOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Vector3 } from 'three'
import type { LocalPlayerProfile, MultiplayerPlayerSnapshot } from './world-multiplayer-lab-client'

declare global {
  interface Window {
    __LANDRUSH_WORLD_MULTIPLAYER_LAB__?: unknown
    webkitAudioContext?: typeof AudioContext
  }
}

export type SpatialVoiceSignalPayload =
  | { description: RTCSessionDescriptionInit; type: 'description' }
  | { candidate: RTCIceCandidateInit; type: 'ice-candidate' }
  | { type: 'disconnect' }
  | { type: 'ready' }

export type SpatialVoiceSignalMessage = {
  from: string
  sequence?: number
  signal: SpatialVoiceSignalPayload
}

export type SpatialVoiceStatus = 'idle' | 'starting' | 'live' | 'error' | 'unsupported'

export type SpatialVoiceStats = {
  audiblePeerCount: number
  audioConnectedPeerCount: number
  audioContextState: AudioContextState | 'missing'
  connectedPeerCount: number
  inboundBytes: number
  inboundPackets: number
  outboundTrackCount: number
  outboundBytes: number
  outboundPackets: number
  outputRmsLevel: number
  peerCount: number
  remoteTrackCount: number
  rmsLevel: number
}

export type SpatialVoiceController = {
  available: boolean
  desired: boolean
  error: string | null
  stats: SpatialVoiceStats
  status: SpatialVoiceStatus
  toggle: () => void
}

type SpatialAudioMotion = {
  heading: number
  position: Vector3
}

type UseLandrushSpatialVoiceOptions = {
  available: boolean
  incomingSignals: readonly SpatialVoiceSignalMessage[]
  localMotionRef: { readonly current: SpatialAudioMotion | null }
  localProfile: LocalPlayerProfile
  remotePlayers: readonly MultiplayerPlayerSnapshot[]
  roomId: string
  sendSignal: (to: string, signal: SpatialVoiceSignalPayload) => boolean
}

type VoicePeer = {
  analyser: AnalyserNode | null
  audioElement: HTMLAudioElement | null
  audioElementError: string | null
  audioData: Uint8Array<ArrayBuffer> | null
  connection: RTCPeerConnection
  gain: GainNode | null
  hasRemoteTrack: boolean
  id: string
  makingOffer: boolean
  outputAnalyser: AnalyserNode | null
  outputAudioData: Uint8Array<ArrayBuffer> | null
  panner: PannerNode | null
  pendingIceCandidates: RTCIceCandidateInit[]
  polite: boolean
  remoteStream: MediaStream
  rtcStats: VoicePeerRtcStats
  settingRemoteAnswerPending: boolean
  source: AudioNode | null
}

type VoicePeerRtcStats = {
  inboundAudioLevel: number
  inboundBytes: number
  inboundPackets: number
  inboundTotalAudioEnergy: number
  localAudioLevel: number
  localTotalAudioEnergy: number
  outboundBytes: number
  outboundPackets: number
  sampledAt: number
}

export const SPATIAL_VOICE_MAX_DISTANCE = 28
const SPATIAL_VOICE_REFERENCE_DISTANCE = 1.5
const SPATIAL_VOICE_ROLLOFF = 1.35
const SPATIAL_VOICE_UPDATE_INTERVAL_MS = 80
const SPATIAL_VOICE_STATS_INTERVAL_MS = 250
const SPATIAL_VOICE_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

const EMPTY_STATS: SpatialVoiceStats = {
  audiblePeerCount: 0,
  audioConnectedPeerCount: 0,
  audioContextState: 'missing',
  connectedPeerCount: 0,
  inboundBytes: 0,
  inboundPackets: 0,
  outboundTrackCount: 0,
  outboundBytes: 0,
  outboundPackets: 0,
  outputRmsLevel: 0,
  peerCount: 0,
  remoteTrackCount: 0,
  rmsLevel: 0,
}

export function useLandrushSpatialVoice({
  available,
  incomingSignals,
  localMotionRef,
  localProfile,
  remotePlayers,
  roomId,
  sendSignal,
}: UseLandrushSpatialVoiceOptions): SpatialVoiceController {
  const [desired, setDesired] = useState(false)
  const [status, setStatus] = useState<SpatialVoiceStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<SpatialVoiceStats>(EMPTY_STATS)
  const audioContextRef = useRef<AudioContext | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const pendingSignalsRef = useRef<SpatialVoiceSignalMessage[]>([])
  const peersRef = useRef(new Map<string, VoicePeer>())
  const processedSignalKeysRef = useRef(new Set<string>())
  const remotePlayersRef = useRef(remotePlayers)
  const sendSignalRef = useRef(sendSignal)
  const remotePlayerKey = remotePlayers.map((player) => player.id).join('|')

  remotePlayersRef.current = remotePlayers
  sendSignalRef.current = sendSignal

  const publishStats = useCallback(() => {
    const audioContext = audioContextRef.current
    const localStream = localStreamRef.current
    let audiblePeerCount = 0
    let audioConnectedPeerCount = 0
    let connectedPeerCount = 0
    let inboundBytes = 0
    let inboundPackets = 0
    let maxLevel = 0
    let maxOutputLevel = 0
    let outboundBytes = 0
    let outboundPackets = 0
    let remoteTrackCount = 0

    for (const peer of peersRef.current.values()) {
      if (peer.connection.connectionState === 'connected') connectedPeerCount += 1
      if (peer.hasRemoteTrack) remoteTrackCount += 1
      if (peer.source && peer.analyser) audioConnectedPeerCount += 1
      inboundBytes += peer.rtcStats.inboundBytes
      inboundPackets += peer.rtcStats.inboundPackets
      outboundBytes += peer.rtcStats.outboundBytes
      outboundPackets += peer.rtcStats.outboundPackets
      const level = measurePeerLevel(peer)
      const outputLevel = measurePeerOutputLevel(peer)
      if (level > 0.01) audiblePeerCount += 1
      maxLevel = Math.max(maxLevel, level)
      maxOutputLevel = Math.max(maxOutputLevel, outputLevel)
    }

    setStats({
      audiblePeerCount,
      audioConnectedPeerCount,
      audioContextState: audioContext?.state ?? 'missing',
      connectedPeerCount,
      inboundBytes,
      inboundPackets,
      outboundTrackCount: localStream?.getAudioTracks().length ?? 0,
      outboundBytes,
      outboundPackets,
      outputRmsLevel: roundLevel(maxOutputLevel),
      peerCount: peersRef.current.size,
      remoteTrackCount,
      rmsLevel: roundLevel(maxLevel),
    })
  }, [])

  const closePeer = useCallback(
    (peerId: string, notify = true) => {
      const peer = peersRef.current.get(peerId)
      if (!peer) return

      if (notify) sendSignalRef.current(peerId, { type: 'disconnect' })
      disconnectPeerAudio(peer)
      peer.connection.close()
      peersRef.current.delete(peerId)
      publishStats()
    },
    [publishStats],
  )

  const createPeer = useCallback(
    (peerId: string) => {
      const existing = peersRef.current.get(peerId)
      if (existing) return existing

      const connection = new RTCPeerConnection({ iceServers: SPATIAL_VOICE_ICE_SERVERS })
      const peer: VoicePeer = {
        analyser: null,
        audioElement: null,
        audioElementError: null,
        audioData: null,
        connection,
        gain: null,
        hasRemoteTrack: false,
        id: peerId,
        makingOffer: false,
        outputAnalyser: null,
        outputAudioData: null,
        panner: null,
        pendingIceCandidates: [],
        polite: localProfile.id.localeCompare(peerId) > 0,
        remoteStream: new MediaStream(),
        rtcStats: createEmptyVoicePeerRtcStats(),
        settingRemoteAnswerPending: false,
        source: null,
      }
      peersRef.current.set(peerId, peer)

      for (const track of localStreamRef.current?.getAudioTracks() ?? []) {
        connection.addTrack(track, localStreamRef.current!)
      }

      connection.addEventListener('icecandidate', (event) => {
        if (!event.candidate) return
        sendSignalRef.current(peerId, {
          candidate: event.candidate.toJSON(),
          type: 'ice-candidate',
        })
      })

      connection.addEventListener('connectionstatechange', () => {
        if (
          connection.connectionState === 'closed' ||
          connection.connectionState === 'failed' ||
          connection.connectionState === 'disconnected'
        ) {
          if (connection.connectionState === 'failed') closePeer(peerId, true)
        }
        publishStats()
      })

      connection.addEventListener('track', (event) => {
        for (const track of event.streams[0]?.getAudioTracks() ?? [event.track]) {
          if (track.kind === 'audio' && !peer.remoteStream.getTrackById(track.id)) {
            peer.remoteStream.addTrack(track)
          }
        }
        peer.hasRemoteTrack = peer.remoteStream.getAudioTracks().length > 0
        connectPeerAudio(peer, audioContextRef.current)
        publishStats()
      })

      publishStats()
      return peer
    },
    [closePeer, localProfile.id, publishStats],
  )

  const syncPeers = useCallback(() => {
    if (!localStreamRef.current) return

    const remoteIds = new Set(remotePlayersRef.current.map((player) => player.id))
    for (const peerId of remoteIds) {
      const peer = createPeer(peerId)
      sendSignalRef.current(peerId, { type: 'ready' })
      if (shouldInitiateVoicePeer(localProfile.id, peerId)) {
        void createAndSendDescription(peer, sendSignalRef.current)
      }
    }
    for (const peerId of peersRef.current.keys()) {
      if (!remoteIds.has(peerId)) closePeer(peerId)
    }
    publishStats()
  }, [closePeer, createPeer, localProfile.id, publishStats])

  const handleSignal = useCallback(
    async (message: SpatialVoiceSignalMessage) => {
      if (!isSpatialVoiceSignalPayload(message.signal)) return
      if (message.from === localProfile.id) return

      if (!localStreamRef.current) {
        queuePendingVoiceSignal(pendingSignalsRef.current, message)
        return
      }

      if (message.signal.type === 'disconnect') {
        closePeer(message.from, false)
        return
      }

      if (message.signal.type === 'ready') {
        const peer = createPeer(message.from)
        if (shouldInitiateVoicePeer(localProfile.id, message.from)) {
          await createAndSendDescription(peer, sendSignalRef.current)
        }
        return
      }

      const peer = createPeer(message.from)
      const { connection } = peer

      try {
        if (message.signal.type === 'description') {
          const description = message.signal.description
          if (description.type === 'answer' && connection.signalingState !== 'have-local-offer') {
            return
          }

          const readyForOffer =
            !peer.makingOffer &&
            (connection.signalingState === 'stable' || peer.settingRemoteAnswerPending)
          const offerCollision = description.type === 'offer' && !readyForOffer

          if (offerCollision && !peer.polite) return

          peer.settingRemoteAnswerPending = description.type === 'answer'
          if (offerCollision && connection.signalingState !== 'stable') {
            await connection.setLocalDescription({ type: 'rollback' })
          }
          await connection.setRemoteDescription(description)
          peer.settingRemoteAnswerPending = false
          await flushPendingIceCandidates(peer)

          if (description.type === 'offer') {
            await connection.setLocalDescription()
            const localDescription = connection.localDescription
            if (localDescription) {
              sendSignalRef.current(message.from, {
                description: localDescription.toJSON(),
                type: 'description',
              })
            }
          }
          return
        }

        if (!connection.remoteDescription) {
          peer.pendingIceCandidates.push(message.signal.candidate)
          return
        }
        await connection.addIceCandidate(message.signal.candidate)
      } catch (signalError) {
        setError(signalError instanceof Error ? signalError.message : 'Voice signal failed')
        setStatus('error')
      } finally {
        publishStats()
      }
    },
    [closePeer, createPeer, localProfile.id, publishStats],
  )

  const flushPendingSignals = useCallback(() => {
    const pending = pendingSignalsRef.current.splice(0)
    for (const signal of pending) void handleSignal(signal)
  }, [handleSignal])

  useEffect(() => {
    if (incomingSignals.length === 0) return

    const processedSignalKeys = processedSignalKeysRef.current
    for (const signal of incomingSignals) {
      const key = signalMessageKey(signal)
      if (processedSignalKeys.has(key)) continue
      processedSignalKeys.add(key)
      void handleSignal(signal)
    }

    if (processedSignalKeys.size > 200) {
      const recentKeys = incomingSignals.slice(-100).map(signalMessageKey)
      processedSignalKeys.clear()
      for (const key of recentKeys) processedSignalKeys.add(key)
    }
  }, [handleSignal, incomingSignals])

  useEffect(() => {
    if (!desired || !available || localProfile.id === 'local-pending') {
      cleanupVoice(peersRef.current, localStreamRef, audioContextRef, sendSignalRef.current)
      pendingSignalsRef.current = []
      setStats(EMPTY_STATS)
      setStatus(desired && !available ? 'idle' : 'idle')
      return
    }

    let cancelled = false

    const startVoice = async () => {
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
        setStatus('unsupported')
        setError('Voice chat is not supported in this browser')
        return
      }

      setStatus('starting')
      setError(null)

      try {
        const audioContext = getOrCreateSpatialVoiceAudioContext(audioContextRef.current)
        if (!audioContext) {
          setStatus('unsupported')
          setError('Web Audio is not supported in this browser')
          return
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => {
            track.stop()
          })
          if (audioContextRef.current === audioContext) audioContextRef.current = null
          void audioContext.close()
          return
        }

        await audioContext.resume()
        audioContextRef.current = audioContext
        localStreamRef.current = stream
        setStatus('live')
        syncPeers()
        flushPendingSignals()
        publishStats()
      } catch (startError) {
        cleanupVoice(peersRef.current, localStreamRef, audioContextRef, sendSignalRef.current)
        setStatus('error')
        setError(startError instanceof Error ? startError.message : 'Could not start microphone')
      }
    }

    void startVoice()

    return () => {
      cancelled = true
      cleanupVoice(peersRef.current, localStreamRef, audioContextRef, sendSignalRef.current)
      setStats(EMPTY_STATS)
    }
  }, [available, desired, flushPendingSignals, localProfile.id, publishStats, syncPeers])

  useEffect(() => {
    void remotePlayerKey
    if (!desired || status !== 'live') return
    syncPeers()
  }, [desired, remotePlayerKey, status, syncPeers])

  useEffect(() => {
    if (status !== 'live') return

    const updateTimer = window.setInterval(() => {
      updateListener(audioContextRef.current, localMotionRef.current)
      updatePeerPositions(peersRef.current, remotePlayersRef.current)
    }, SPATIAL_VOICE_UPDATE_INTERVAL_MS)
    const statsTimer = window.setInterval(publishStats, SPATIAL_VOICE_STATS_INTERVAL_MS)
    const rtcStatsTimer = window.setInterval(() => {
      void updatePeerRtcStats(peersRef.current).finally(publishStats)
    }, 1000)

    return () => {
      window.clearInterval(updateTimer)
      window.clearInterval(statsTimer)
      window.clearInterval(rtcStatsTimer)
    }
  }, [localMotionRef, publishStats, status])

  useEffect(
    () =>
      setMultiplayerDebugHandle('voice', () => ({
        available,
        desired,
        error,
        peers: [...peersRef.current.values()].map((peer) => {
          const remotePlayer = remotePlayersRef.current.find((player) => player.id === peer.id)
          const localPosition = localMotionRef.current?.position
          const distanceMeters =
            remotePlayer && localPosition
              ? Math.hypot(
                  remotePlayer.position[0] - localPosition.x,
                  remotePlayer.position[1] - localPosition.y,
                  remotePlayer.position[2] - localPosition.z,
                )
              : null

          return {
            connected: peer.connection.connectionState,
            audioConnected: Boolean(peer.source && peer.analyser),
            audioElement: peer.audioElement
              ? {
                  error: peer.audioElementError,
                  paused: peer.audioElement.paused,
                  readyState: peer.audioElement.readyState,
                }
              : null,
            distanceMeters: distanceMeters === null ? null : roundLevel(distanceMeters),
            gain: peer.gain ? roundLevel(peer.gain.gain.value) : null,
            hasRemoteTrack: peer.hasRemoteTrack,
            id: peer.id,
            level: roundLevel(measurePeerLevel(peer)),
            outputLevel: roundLevel(measurePeerOutputLevel(peer)),
            pannerPosition: peer.panner
              ? [
                  roundLevel(peer.panner.positionX.value),
                  roundLevel(peer.panner.positionY.value),
                  roundLevel(peer.panner.positionZ.value),
                ]
              : null,
            remotePlayerPosition: remotePlayer?.position ?? null,
            remoteTracks: peer.remoteStream.getAudioTracks().map((track) => ({
              enabled: track.enabled,
              id: track.id,
              muted: track.muted,
              readyState: track.readyState,
            })),
            rtc: peer.rtcStats,
            signaling: peer.connection.signalingState,
          }
        }),
        roomId,
        stats,
        status,
      })),
    [available, desired, error, roomId, stats, status],
  )

  useEffect(
    () => () => {
      cleanupVoice(peersRef.current, localStreamRef, audioContextRef, sendSignalRef.current)
    },
    [],
  )

  const toggle = useCallback(() => {
    if (!available && !desired) return
    if (!desired) {
      const audioContext = getOrCreateSpatialVoiceAudioContext(audioContextRef.current)
      if (!audioContext) {
        setStatus('unsupported')
        setError('Web Audio is not supported in this browser')
        return
      }
      audioContextRef.current = audioContext
      void audioContext.resume().catch((resumeError: unknown) => {
        setError(resumeError instanceof Error ? resumeError.message : 'Audio playback was blocked')
      })
    }
    setDesired((current) => !current)
  }, [available, desired])

  return {
    available,
    desired,
    error,
    stats,
    status,
    toggle,
  }
}

export function SpatialVoiceControl({ voice }: { voice: SpatialVoiceController }) {
  const active = voice.desired && voice.status === 'live'
  const blocked = !voice.available && !voice.desired
  const Icon = active ? Mic : MicOff
  const title =
    voice.status === 'error'
      ? (voice.error ?? 'Voice unavailable')
      : active
        ? 'Mute spatial voice'
        : 'Enable spatial voice'

  return (
    <button
      aria-label={title}
      className={[
        'grid size-7 shrink-0 place-items-center rounded border transition',
        active
          ? 'border-emerald-200/60 bg-emerald-300/18 text-emerald-100'
          : 'border-white/12 bg-white/7 text-white/70 hover:border-white/24 hover:text-white',
        voice.status === 'error' ? 'border-rose-200/50 text-rose-100' : '',
        blocked ? 'cursor-not-allowed opacity-45 hover:border-white/12 hover:text-white/70' : '',
      ].join(' ')}
      disabled={blocked}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        voice.toggle()
      }}
      title={title}
      type="button"
    >
      <Icon className="size-3.5" aria-hidden />
    </button>
  )
}

export function isSpatialVoiceSignalPayload(value: unknown): value is SpatialVoiceSignalPayload {
  const signal = value as SpatialVoiceSignalPayload
  if (signal?.type === 'disconnect') return true
  if (signal?.type === 'ready') return true
  if (signal?.type === 'ice-candidate') return Boolean(signal.candidate)
  return (
    signal?.type === 'description' &&
    (signal.description?.type === 'offer' || signal.description?.type === 'answer') &&
    typeof signal.description.sdp === 'string'
  )
}

async function flushPendingIceCandidates(peer: VoicePeer) {
  const pendingCandidates = peer.pendingIceCandidates.splice(0)
  for (const candidate of pendingCandidates) {
    await peer.connection.addIceCandidate(candidate)
  }
}

function queuePendingVoiceSignal(
  pendingSignals: SpatialVoiceSignalMessage[],
  message: SpatialVoiceSignalMessage,
) {
  pendingSignals.push(message)
  if (pendingSignals.length > 96) pendingSignals.splice(0, pendingSignals.length - 96)
}

function shouldInitiateVoicePeer(localPeerId: string, remotePeerId: string) {
  return localPeerId.localeCompare(remotePeerId) < 0
}

function getOrCreateSpatialVoiceAudioContext(current: AudioContext | null) {
  if (current && current.state !== 'closed') return current
  const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext
  return AudioContextCtor ? new AudioContextCtor() : null
}

function createEmptyVoicePeerRtcStats(): VoicePeerRtcStats {
  return {
    inboundAudioLevel: 0,
    inboundBytes: 0,
    inboundPackets: 0,
    inboundTotalAudioEnergy: 0,
    localAudioLevel: 0,
    localTotalAudioEnergy: 0,
    outboundBytes: 0,
    outboundPackets: 0,
    sampledAt: 0,
  }
}

async function updatePeerRtcStats(peers: Map<string, VoicePeer>) {
  await Promise.all(
    [...peers.values()].map(async (peer) => {
      if (peer.connection.connectionState === 'closed') return

      try {
        const stats = await peer.connection.getStats()
        const nextStats = createEmptyVoicePeerRtcStats()
        nextStats.sampledAt = Date.now()

        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            nextStats.inboundAudioLevel = Math.max(
              nextStats.inboundAudioLevel,
              numberStat(report.audioLevel),
            )
            nextStats.inboundBytes += numberStat(report.bytesReceived)
            nextStats.inboundPackets += numberStat(report.packetsReceived)
            nextStats.inboundTotalAudioEnergy += numberStat(report.totalAudioEnergy)
          }
          if (report.type === 'outbound-rtp' && report.kind === 'audio') {
            nextStats.outboundBytes += numberStat(report.bytesSent)
            nextStats.outboundPackets += numberStat(report.packetsSent)
          }
          if (report.type === 'media-source' && report.kind === 'audio') {
            nextStats.localAudioLevel = Math.max(
              nextStats.localAudioLevel,
              numberStat(report.audioLevel),
            )
            nextStats.localTotalAudioEnergy += numberStat(report.totalAudioEnergy)
          }
        })

        peer.rtcStats = nextStats
      } catch {
        peer.rtcStats = createEmptyVoicePeerRtcStats()
      }
    }),
  )
}

async function createAndSendDescription(
  peer: VoicePeer,
  sendSignal: (to: string, signal: SpatialVoiceSignalPayload) => boolean,
) {
  if (peer.makingOffer || peer.connection.signalingState !== 'stable') return

  try {
    peer.makingOffer = true
    await peer.connection.setLocalDescription()
    const localDescription = peer.connection.localDescription
    if (localDescription) {
      sendSignal(peer.id, {
        description: localDescription.toJSON(),
        type: 'description',
      })
    }
  } catch {
    // Negotiation can be superseded by an incoming polite offer.
  } finally {
    peer.makingOffer = false
  }
}

function connectPeerAudio(peer: VoicePeer, audioContext: AudioContext | null) {
  if (!audioContext || peer.source) return
  const tracks = peer.remoteStream.getAudioTracks()
  if (tracks.length === 0) return

  const audioElement = document.createElement('audio')
  audioElement.autoplay = true
  audioElement.setAttribute('playsinline', 'true')
  audioElement.srcObject = peer.remoteStream
  audioElement.style.display = 'none'
  audioElement.volume = 0
  document.body.appendChild(audioElement)

  const source = audioContext.createMediaStreamSource(peer.remoteStream)
  const panner = audioContext.createPanner()
  const gain = audioContext.createGain()
  const analyser = audioContext.createAnalyser()
  const outputAnalyser = audioContext.createAnalyser()

  panner.distanceModel = 'inverse'
  panner.maxDistance = SPATIAL_VOICE_MAX_DISTANCE
  panner.refDistance = SPATIAL_VOICE_REFERENCE_DISTANCE
  panner.rolloffFactor = SPATIAL_VOICE_ROLLOFF
  panner.panningModel = 'HRTF'
  gain.gain.value = 0.95
  analyser.fftSize = 256
  outputAnalyser.fftSize = 256

  source.connect(analyser)
  source.connect(panner)
  panner.connect(gain)
  gain.connect(outputAnalyser)
  outputAnalyser.connect(audioContext.destination)

  void audioElement.play().catch((error: unknown) => {
    peer.audioElementError = error instanceof Error ? error.message : 'Remote audio play blocked'
  })

  peer.analyser = analyser
  peer.audioElement = audioElement
  peer.audioElementError = null
  peer.audioData = new Uint8Array(analyser.fftSize)
  peer.gain = gain
  peer.outputAnalyser = outputAnalyser
  peer.outputAudioData = new Uint8Array(outputAnalyser.fftSize)
  peer.panner = panner
  peer.source = source
}

function disconnectPeerAudio(peer: VoicePeer) {
  for (const node of [peer.source, peer.panner, peer.gain, peer.analyser, peer.outputAnalyser]) {
    try {
      node?.disconnect()
    } catch {
      // Already disconnected.
    }
  }
  peer.remoteStream.getTracks().forEach((track) => {
    track.stop()
  })
  peer.audioElement?.remove()
  peer.analyser = null
  peer.audioElement = null
  peer.audioElementError = null
  peer.audioData = null
  peer.gain = null
  peer.outputAnalyser = null
  peer.outputAudioData = null
  peer.panner = null
  peer.source = null
}

function updateListener(audioContext: AudioContext | null, motion: SpatialAudioMotion | null) {
  if (!audioContext || !motion) return

  const listener = audioContext.listener
  const { heading, position } = motion
  const time = audioContext.currentTime
  setAudioParam(listener.positionX, position.x, time)
  setAudioParam(listener.positionY, position.y, time)
  setAudioParam(listener.positionZ, position.z, time)
  setAudioParam(listener.forwardX, Math.sin(heading), time)
  setAudioParam(listener.forwardY, 0, time)
  setAudioParam(listener.forwardZ, Math.cos(heading), time)
  setAudioParam(listener.upX, 0, time)
  setAudioParam(listener.upY, 1, time)
  setAudioParam(listener.upZ, 0, time)
}

function updatePeerPositions(
  peers: Map<string, VoicePeer>,
  remotePlayers: readonly MultiplayerPlayerSnapshot[],
) {
  const playerMap = new Map(remotePlayers.map((player) => [player.id, player]))
  for (const peer of peers.values()) {
    const player = playerMap.get(peer.id)
    if (!player || !peer.panner) continue
    const time = peer.panner.context.currentTime
    setAudioParam(peer.panner.positionX, player.position[0], time)
    setAudioParam(peer.panner.positionY, player.position[1], time)
    setAudioParam(peer.panner.positionZ, player.position[2], time)
  }
}

function setAudioParam(param: AudioParam, value: number, time: number) {
  param.setTargetAtTime(value, time, 0.035)
}

function measurePeerLevel(peer: VoicePeer) {
  if (!peer.analyser || !peer.audioData) return 0
  peer.analyser.getByteTimeDomainData(peer.audioData)
  return measureAudioDataLevel(peer.audioData)
}

function measurePeerOutputLevel(peer: VoicePeer) {
  if (!peer.outputAnalyser || !peer.outputAudioData) return 0
  peer.outputAnalyser.getByteTimeDomainData(peer.outputAudioData)
  return measureAudioDataLevel(peer.outputAudioData)
}

function measureAudioDataLevel(audioData: Uint8Array<ArrayBuffer>) {
  let sum = 0
  for (const value of audioData) {
    const centered = (value - 128) / 128
    sum += centered * centered
  }
  return Math.sqrt(sum / audioData.length)
}

function cleanupVoice(
  peers: Map<string, VoicePeer>,
  localStreamRef: { current: MediaStream | null },
  audioContextRef: { current: AudioContext | null },
  sendSignal: (to: string, signal: SpatialVoiceSignalPayload) => boolean,
) {
  for (const peer of peers.values()) {
    sendSignal(peer.id, { type: 'disconnect' })
    disconnectPeerAudio(peer)
    peer.connection.close()
  }
  peers.clear()

  localStreamRef.current?.getTracks().forEach((track) => {
    track.stop()
  })
  localStreamRef.current = null

  const audioContext = audioContextRef.current
  audioContextRef.current = null
  if (audioContext && audioContext.state !== 'closed') void audioContext.close()
}

function signalMessageKey(message: SpatialVoiceSignalMessage) {
  return message.sequence === undefined
    ? JSON.stringify(message)
    : `${message.from}:${message.sequence}`
}

function setMultiplayerDebugHandle(key: string, value: unknown) {
  const debug = getMultiplayerDebugSurface()
  debug[key] = value
  window.__LANDRUSH_WORLD_MULTIPLAYER_LAB__ = debug

  return () => {
    const current = window.__LANDRUSH_WORLD_MULTIPLAYER_LAB__
    if (!current || typeof current !== 'object') return

    const currentDebug = current as Record<string, unknown>
    if (currentDebug[key] === value) delete currentDebug[key]
    if (Object.keys(currentDebug).length === 0) {
      delete window.__LANDRUSH_WORLD_MULTIPLAYER_LAB__
    }
  }
}

function getMultiplayerDebugSurface() {
  const current = window.__LANDRUSH_WORLD_MULTIPLAYER_LAB__
  return current && typeof current === 'object' ? (current as Record<string, unknown>) : {}
}

function roundLevel(value: number) {
  return Math.round(value * 1000) / 1000
}

function numberStat(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
