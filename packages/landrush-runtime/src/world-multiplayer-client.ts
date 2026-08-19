'use client'

import {
  type ConnectionStatus,
  isParcelBuildSchemaVersion,
  isSpatialVoiceSignalPayload,
  type LocalPlayerProfile,
  type MultiplayerPlayerSnapshot,
  normalizeParcelBuildRevision,
  PARCEL_BUILD_SCHEMA_VERSION,
  type ParcelBuildNode,
  type ParcelBuildSnapshot,
  type ParcelClaimError,
  type ParcelOwnership,
  type SpatialVoiceSignalMessage,
  type SpatialVoiceSignalPayload,
  type SyncParcelBuildNodesMessage,
  sanitizeMultiplayerRoomId,
  type TvMediaStateSnapshot,
} from '@landrush/protocol'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type RemotePresentationStore,
  type RemotePresentationTimeline,
  reconcileRemotePresentationTimeline,
  resolveRemotePresentationSnapshot,
} from './multiplayer-presentation'
import { renderScheduler } from './render-scheduler'

export type MultiplayerRemotePlayerStore = RemotePresentationStore<MultiplayerPlayerSnapshot>

type MultiplayerRemotePlayerTimeline = RemotePresentationTimeline<MultiplayerPlayerSnapshot>

export type ParcelBuildNodesSnapshot = ParcelBuildSnapshot<ParcelBuildNode>

type ParcelBuildSyncQueueEntry = {
  inFlight: { nodes: ParcelBuildNode[]; operationId: string } | null
  parcelId: string
  pendingNodes: ParcelBuildNode[] | null
  worldId: string
}

type OfflineParcelStateStore = Record<
  string,
  | {
      builds?: ParcelBuildNodesSnapshot[]
      ownerships?: ParcelOwnership[]
      tvMediaStates?: TvMediaStateSnapshot[]
    }
  | undefined
>

type ServerMessage =
  | {
      connectionId: string
      heartbeatIntervalMs: number
      maxPeers: number
      serverTime: number
      stalePeerMs: number
      type: 'welcome'
    }
  | { players: MultiplayerPlayerSnapshot[]; roomId: string; serverTime: number; type: 'snapshot' }
  | {
      player: MultiplayerPlayerSnapshot
      roomId: string
      serverTime: number
      type: 'player-joined' | 'player-state'
    }
  | {
      from: string
      roomId: string
      serverTime: number
      signal: SpatialVoiceSignalPayload
      type: 'voice-signal'
    }
  | { id: string; reason?: string; roomId: string; serverTime: number; type: 'player-left' }
  | {
      ownership: ParcelOwnership
      roomId: string
      serverTime: number
      type: 'parcel-claim-result' | 'parcel-owned'
    }
  | {
      code: string
      message: string
      parcelId?: string
      roomId?: string
      serverTime: number
      type: 'parcel-claim-rejected'
      worldId?: string
    }
  | {
      ownerships: ParcelOwnership[]
      roomId: string
      serverTime: number
      type: 'parcel-ownership-snapshot'
      worldId: string
    }
  | {
      builds: ParcelBuildNodesSnapshot[]
      roomId: string
      serverTime: number
      type: 'parcel-build-nodes-snapshot'
      worldId: string
    }
  | {
      build: ParcelBuildNodesSnapshot
      roomId: string
      serverTime: number
      type: 'parcel-build-nodes-synced' | 'parcel-build-nodes-updated'
    }
  | {
      build: ParcelBuildNodesSnapshot | null
      operationId: string
      reason: string
      roomId: string
      serverTime: number
      type: 'parcel-build-nodes-conflict'
    }
  | {
      roomId: string
      serverTime: number
      tvs: TvMediaStateSnapshot[]
      type: 'tv-media-state-snapshot'
      worldId: string
    }
  | {
      roomId: string
      serverTime: number
      tv: TvMediaStateSnapshot
      type: 'tv-media-state-synced' | 'tv-media-state-updated'
    }
  | { playerCount: number; roomId: string; serverTime: number; type: 'room-state' }
  | {
      playerCount?: number
      roomId?: string
      sentAt?: number
      serverTime: number
      type: 'heartbeat'
    }
  | { code: string; message: string; serverTime: number; type: 'error' }

export type MultiplayerConnectionDetails = {
  connectionId: string | null
  heartbeatIntervalMs: number
  latencyMs: number | null
  lastError: string | null
  maxPeers: number | null
  reconnectAttempt: number
  serverPlayerCount: number | null
  stalePeerMs: number | null
}

const PLAYER_STORAGE_KEY = 'landrush-lab-world-multiplayer-player'

const OFFLINE_PARCEL_STATE_STORAGE_KEY = 'landrush-lab-world-multiplayer-offline-parcels'

const LOCAL_STATE_IDLE_SEND_INTERVAL_MS = 2000

const LOCAL_STATE_HEADING_EPSILON = 0.02

const LOCAL_STATE_POSITION_EPSILON = 0.03

const LOCAL_STATE_SPEED_EPSILON = 0.05

const REMOTE_PLAYER_STALE_MS = 12_000

export const MULTIPLAYER_LATENCY_EVENT = 'landrush-multiplayer-latency'

const PLAYER_COLORS = ['#7dd3fc', '#facc15', '#86efac', '#f0abfc', '#fb7185', '#c4b5fd'] as const

const DEFAULT_MULTIPLAYER_WEBSOCKET_URL =
  'wss://landrush-world-multiplayer.onrender.com/api/landrush-lab/world-multiplayer/ws'

const HOSTED_MULTIPLAYER_WEBSOCKET_URL =
  process.env.NEXT_PUBLIC_LANDRUSH_WORLD_MULTIPLAYER_WS_URL ?? DEFAULT_MULTIPLAYER_WEBSOCKET_URL

const FALLBACK_LOCAL_PROFILE = {
  color: PLAYER_COLORS[0],
  id: 'local-pending',
  name: 'Player',
} satisfies LocalPlayerProfile

function createConnectionDetails(): MultiplayerConnectionDetails {
  return {
    connectionId: null,
    heartbeatIntervalMs: 3000,
    latencyMs: null,
    lastError: null,
    maxPeers: null,
    reconnectAttempt: 0,
    serverPlayerCount: null,
    stalePeerMs: null,
  }
}

function sortedRemotePlayerSnapshots(map: ReadonlyMap<string, MultiplayerPlayerSnapshot>) {
  return [...map.values()].sort((first, second) => first.name.localeCompare(second.name))
}

function remotePlayerRosterChanged(
  previous: MultiplayerPlayerSnapshot,
  next: MultiplayerPlayerSnapshot,
) {
  return previous.name !== next.name || previous.color !== next.color || previous.pose !== next.pose
}

export function useLandrushWorldMultiplayer({
  enabled,
  localProfile,
  onVoiceSignal,
  persistOfflineState = true,
  roomId,
  spectator,
}: {
  enabled: boolean
  localProfile: LocalPlayerProfile
  onVoiceSignal?: (message: SpatialVoiceSignalMessage) => void
  persistOfflineState?: boolean
  roomId: string
  spectator: boolean
}) {
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectDelayRef = useRef(1000)
  const reconnectAttemptRef = useRef(0)
  const latestPlayerRef = useRef<MultiplayerPlayerSnapshot | null>(null)
  const heartbeatIntervalMsRef = useRef(createConnectionDetails().heartbeatIntervalMs)
  const lastNetworkSentAtRef = useRef(0)
  const lastSentPlayerRef = useRef<MultiplayerPlayerSnapshot | null>(null)
  const onVoiceSignalRef = useRef(onVoiceSignal)
  const voiceSignalSequenceRef = useRef(0)
  const watchedParcelWorldIdRef = useRef<string | null>(null)
  const parcelBuildSyncQueueRef = useRef<Map<string, ParcelBuildSyncQueueEntry>>(new Map())
  const remotePlayerMapRef = useRef<Map<string, MultiplayerPlayerSnapshot>>(new Map())
  const remotePlayerTimelineMapRef = useRef<Map<string, MultiplayerRemotePlayerTimeline>>(new Map())
  const [connection, setConnection] =
    useState<MultiplayerConnectionDetails>(createConnectionDetails)
  const [status, setStatus] = useState<ConnectionStatus>(enabled ? 'connecting' : 'offline')
  const [remotePlayerRosterMap, setRemotePlayerRosterMap] = useState<
    Map<string, MultiplayerPlayerSnapshot>
  >(() => new Map())
  const [parcelClaimError, setParcelClaimError] = useState<ParcelClaimError | null>(null)
  const [parcelOwnershipMap, setParcelOwnershipMap] = useState<Map<string, ParcelOwnership>>(
    () => new Map(),
  )
  const [parcelBuildNodeMap, setParcelBuildNodeMap] = useState<
    Map<string, ParcelBuildNodesSnapshot>
  >(() => new Map())
  const [parcelBuildSnapshotWorldId, setParcelBuildSnapshotWorldId] = useState<string | null>(null)
  const [tvMediaStateMap, setTvMediaStateMap] = useState<Map<string, TvMediaStateSnapshot>>(
    () => new Map(),
  )
  const parcelOwnershipMapRef = useRef(parcelOwnershipMap)
  const parcelBuildNodeMapRef = useRef(parcelBuildNodeMap)
  const tvMediaStateMapRef = useRef(tvMediaStateMap)
  const remotePlayers = useMemo(
    () => sortedRemotePlayerSnapshots(remotePlayerRosterMap),
    [remotePlayerRosterMap],
  )
  const remotePlayerStore = useMemo<MultiplayerRemotePlayerStore>(
    () => ({
      getPresentationSnapshot: (id, now) =>
        resolveRemotePresentationSnapshot(remotePlayerTimelineMapRef.current.get(id) ?? null, now),
      getSnapshot: (id) => remotePlayerMapRef.current.get(id) ?? null,
      getSnapshots: () => sortedRemotePlayerSnapshots(remotePlayerMapRef.current),
    }),
    [],
  )
  const parcelOwnerships = useMemo(
    () =>
      [...parcelOwnershipMap.values()].sort((first, second) =>
        first.parcelId.localeCompare(second.parcelId),
      ),
    [parcelOwnershipMap],
  )
  const parcelBuildNodes = useMemo(
    () =>
      [...parcelBuildNodeMap.values()].sort((first, second) =>
        first.parcelId.localeCompare(second.parcelId),
      ),
    [parcelBuildNodeMap],
  )
  const tvMediaStates = useMemo(
    () =>
      [...tvMediaStateMap.values()].sort((first, second) => first.tvId.localeCompare(second.tvId)),
    [tvMediaStateMap],
  )

  useEffect(() => {
    parcelOwnershipMapRef.current = parcelOwnershipMap
  }, [parcelOwnershipMap])

  useEffect(() => {
    parcelBuildNodeMapRef.current = parcelBuildNodeMap
  }, [parcelBuildNodeMap])

  useEffect(() => {
    tvMediaStateMapRef.current = tvMediaStateMap
  }, [tvMediaStateMap])

  useEffect(() => {
    onVoiceSignalRef.current = onVoiceSignal
  }, [onVoiceSignal])

  const sendMessage = useCallback((message: unknown, socket = socketRef.current) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    try {
      socket.send(JSON.stringify(message))
      return true
    } catch {
      setConnection((current) => ({
        ...current,
        lastError: 'Could not send multiplayer message',
      }))
      socket.close()
      return false
    }
  }, [])

  const flushQueuedParcelBuildSync = useCallback(
    (key: string) => {
      const entry = parcelBuildSyncQueueRef.current.get(key)
      if (!(enabled && entry?.pendingNodes) || entry.inFlight) return false

      const currentBuild = parcelBuildNodeMapRef.current.get(entry.parcelId)
      const operationId = createParcelBuildOperationId()
      const nodes = entry.pendingNodes
      const message = {
        baseRevision:
          currentBuild?.worldId === entry.worldId
            ? normalizeParcelBuildRevision(currentBuild.revision)
            : 0,
        nodes,
        operationId,
        parcelId: entry.parcelId,
        schemaVersion: PARCEL_BUILD_SCHEMA_VERSION,
        type: 'sync-parcel-build-nodes',
        worldId: entry.worldId,
      } satisfies SyncParcelBuildNodesMessage<ParcelBuildNode>
      if (!sendMessage(message)) return false

      entry.pendingNodes = null
      entry.inFlight = { nodes, operationId }
      return true
    },
    [enabled, sendMessage],
  )

  const settleParcelBuildSync = useCallback(
    ({
      operationId,
      parcelId,
      retry,
      worldId,
    }: {
      operationId: string
      parcelId: string
      retry: boolean
      worldId: string
    }) => {
      const key = parcelBuildSyncKey(worldId, parcelId)
      const entry = parcelBuildSyncQueueRef.current.get(key)
      if (!entry?.inFlight || entry.inFlight.operationId !== operationId) return
      if (retry && !entry.pendingNodes) entry.pendingNodes = entry.inFlight.nodes
      entry.inFlight = null
      flushQueuedParcelBuildSync(key)
    },
    [flushQueuedParcelBuildSync],
  )

  const requeueInFlightParcelBuildSyncs = useCallback(() => {
    for (const entry of parcelBuildSyncQueueRef.current.values()) {
      if (!entry.inFlight) continue
      if (!entry.pendingNodes) entry.pendingNodes = entry.inFlight.nodes
      entry.inFlight = null
    }
  }, [])

  const sendPlayerState = useCallback(
    (player: MultiplayerPlayerSnapshot) => {
      latestPlayerRef.current = player
      if (!enabled || spectator) return

      const now = window.performance.now()
      if (
        !shouldSendPlayerSnapshot(
          player,
          lastSentPlayerRef.current,
          now - lastNetworkSentAtRef.current,
        )
      ) {
        return
      }

      if (sendMessage({ player, type: 'state' })) {
        lastNetworkSentAtRef.current = now
        lastSentPlayerRef.current = player
      }
    },
    [enabled, sendMessage, spectator],
  )

  const publishLocalPlayer = useCallback(
    (player: MultiplayerPlayerSnapshot) => {
      sendPlayerState(player)
    },
    [sendPlayerState],
  )

  const sendVoiceSignal = useCallback(
    (to: string, signal: SpatialVoiceSignalPayload) =>
      Boolean(sendMessage({ signal, to, type: 'voice-signal' })),
    [sendMessage],
  )

  const watchParcelWorld = useCallback(
    (worldId: string) => {
      if (watchedParcelWorldIdRef.current !== worldId) {
        watchedParcelWorldIdRef.current = worldId
        parcelBuildSyncQueueRef.current.clear()
        const offlineState =
          !enabled && persistOfflineState ? readOfflineParcelWorldState(worldId) : null
        const nextOwnershipMap = offlineState
          ? new Map(offlineState.ownerships.map((ownership) => [ownership.parcelId, ownership]))
          : new Map<string, ParcelOwnership>()
        const nextBuildNodeMap = offlineState
          ? new Map(offlineState.builds.map((build) => [build.parcelId, build]))
          : new Map<string, ParcelBuildNodesSnapshot>()
        const nextTvMediaStateMap = offlineState
          ? new Map(offlineState.tvMediaStates.map((tv) => [tv.tvId, tv]))
          : new Map<string, TvMediaStateSnapshot>()
        parcelOwnershipMapRef.current = nextOwnershipMap
        parcelBuildNodeMapRef.current = nextBuildNodeMap
        tvMediaStateMapRef.current = nextTvMediaStateMap
        setParcelBuildSnapshotWorldId(enabled ? null : worldId)
        setParcelOwnershipMap(nextOwnershipMap)
        setParcelBuildNodeMap(nextBuildNodeMap)
        setTvMediaStateMap(nextTvMediaStateMap)
      }
      if (!enabled) return
      sendMessage({ roomId, type: 'watch-parcels', worldId })
    },
    [enabled, persistOfflineState, roomId, sendMessage],
  )

  const syncParcelBuildNodes = useCallback(
    (worldId: string, parcelId: string, nodes: readonly ParcelBuildNode[]) => {
      watchedParcelWorldIdRef.current = worldId
      const clonedNodes = cloneParcelBuildNodes(nodes)
      if (!enabled) {
        const currentBuild = parcelBuildNodeMapRef.current.get(parcelId)
        const build = {
          nodes: clonedNodes,
          operationId: createParcelBuildOperationId(),
          parcelId,
          revision:
            currentBuild?.worldId === worldId
              ? normalizeParcelBuildRevision(currentBuild.revision) + 1
              : 1,
          schemaVersion: PARCEL_BUILD_SCHEMA_VERSION,
          updatedAt: Date.now(),
          updatedBy: localProfile.id,
          worldId,
        } satisfies ParcelBuildNodesSnapshot
        const nextBuildNodeMap = new Map(parcelBuildNodeMapRef.current)
        nextBuildNodeMap.set(parcelId, build)
        parcelBuildNodeMapRef.current = nextBuildNodeMap
        setParcelBuildNodeMap(nextBuildNodeMap)
        if (persistOfflineState) {
          writeOfflineParcelWorldState(
            worldId,
            [...parcelOwnershipMapRef.current.values()],
            [...nextBuildNodeMap.values()],
            [...tvMediaStateMapRef.current.values()],
          )
        }
        return true
      }

      const key = parcelBuildSyncKey(worldId, parcelId)
      const entry = parcelBuildSyncQueueRef.current.get(key) ?? {
        inFlight: null,
        parcelId,
        pendingNodes: null,
        worldId,
      }
      entry.pendingNodes = clonedNodes
      parcelBuildSyncQueueRef.current.set(key, entry)
      const accepted = entry.inFlight !== null || flushQueuedParcelBuildSync(key)
      if (!accepted) {
        setConnection((current) => ({
          ...current,
          lastError: 'Connect before syncing build nodes',
        }))
      }
      return accepted
    },
    [enabled, flushQueuedParcelBuildSync, localProfile.id, persistOfflineState],
  )

  const syncTvMediaState = useCallback(
    (
      worldId: string,
      parcelId: string,
      tvId: string,
      media: {
        muted: boolean
        playbackSeconds: number
        playbackUpdatedAt: number
        playing: boolean
        url: string
        userVolume: number
      },
    ) => {
      watchedParcelWorldIdRef.current = worldId
      const now = Date.now()
      const tv = {
        muted: Boolean(media.muted),
        parcelId,
        playbackSeconds: Math.max(0, finiteNumber(media.playbackSeconds, 0)),
        playbackUpdatedAt: now,
        playing: Boolean(media.playing),
        tvId,
        updatedAt: now,
        updatedBy: localProfile.id,
        url: media.url,
        userVolume: Math.max(0, Math.min(1, media.userVolume)),
        worldId,
      } satisfies TvMediaStateSnapshot
      const nextTvMediaStateMap = new Map(tvMediaStateMapRef.current)
      nextTvMediaStateMap.set(tvId, tv)
      tvMediaStateMapRef.current = nextTvMediaStateMap
      setTvMediaStateMap(nextTvMediaStateMap)

      if (!enabled) {
        if (persistOfflineState) {
          writeOfflineParcelWorldState(
            worldId,
            [...parcelOwnershipMapRef.current.values()],
            [...parcelBuildNodeMapRef.current.values()],
            [...nextTvMediaStateMap.values()],
          )
        }
        return true
      }

      const sent = sendMessage({
        muted: tv.muted,
        parcelId,
        playbackSeconds: tv.playbackSeconds,
        playing: tv.playing,
        tvId,
        type: 'sync-tv-media-state',
        url: tv.url,
        userVolume: tv.userVolume,
        worldId,
      })
      if (!sent) {
        setConnection((current) => ({
          ...current,
          lastError: 'Connect before syncing TV media',
        }))
      }
      return Boolean(sent)
    },
    [enabled, localProfile.id, persistOfflineState, sendMessage],
  )

  const claimParcel = useCallback(
    (worldId: string, parcelId: string) => {
      watchedParcelWorldIdRef.current = worldId
      setParcelClaimError(null)
      if (!enabled) {
        const currentOwnershipMap = parcelOwnershipMapRef.current
        const existingOwnership = currentOwnershipMap.get(parcelId)
        if (existingOwnership && existingOwnership.owner.id !== localProfile.id) {
          setParcelClaimError({
            code: 'parcel-owned',
            message: 'Parcel already claimed',
            parcelId,
            worldId,
          })
          return false
        }

        const existingLocalOwnership = [...currentOwnershipMap.values()].find(
          (ownership) =>
            ownership.worldId === worldId &&
            ownership.owner.id === localProfile.id &&
            ownership.parcelId !== parcelId,
        )
        if (existingLocalOwnership) {
          setParcelClaimError({
            code: 'already-owns-parcel',
            message: 'You already claimed a parcel',
            parcelId,
            worldId,
          })
          return false
        }

        const nextOwnershipMap = new Map(currentOwnershipMap)
        nextOwnershipMap.set(parcelId, {
          claimedAt: Date.now(),
          owner: localProfile,
          parcelId,
          worldId,
        })
        parcelOwnershipMapRef.current = nextOwnershipMap
        setParcelOwnershipMap(nextOwnershipMap)
        if (persistOfflineState) {
          writeOfflineParcelWorldState(
            worldId,
            [...nextOwnershipMap.values()],
            [...parcelBuildNodeMapRef.current.values()],
            [...tvMediaStateMapRef.current.values()],
          )
        }
        return true
      }

      const sent = sendMessage({ parcelId, type: 'claim-parcel', worldId })
      if (!sent) {
        setParcelClaimError({
          code: 'not-connected',
          message: 'Connect before claiming a parcel',
          parcelId,
          worldId,
        })
      }
      return Boolean(sent)
    },
    [enabled, localProfile, persistOfflineState, sendMessage],
  )

  useEffect(() => {
    if (!enabled || (!spectator && localProfile.id === FALLBACK_LOCAL_PROFILE.id)) {
      parcelBuildSyncQueueRef.current.clear()
      setStatus(enabled ? 'connecting' : 'offline')
      remotePlayerMapRef.current = new Map()
      remotePlayerTimelineMapRef.current = new Map()
      setRemotePlayerRosterMap(new Map())
      setParcelClaimError(null)
      const offlineState =
        !enabled && persistOfflineState
          ? readOfflineParcelWorldState(watchedParcelWorldIdRef.current)
          : null
      const nextOwnershipMap = offlineState
        ? new Map(offlineState.ownerships.map((ownership) => [ownership.parcelId, ownership]))
        : new Map<string, ParcelOwnership>()
      const nextBuildNodeMap = offlineState
        ? new Map(offlineState.builds.map((build) => [build.parcelId, build]))
        : new Map<string, ParcelBuildNodesSnapshot>()
      const nextTvMediaStateMap = offlineState
        ? new Map(offlineState.tvMediaStates.map((tv) => [tv.tvId, tv]))
        : new Map<string, TvMediaStateSnapshot>()
      parcelOwnershipMapRef.current = nextOwnershipMap
      parcelBuildNodeMapRef.current = nextBuildNodeMap
      tvMediaStateMapRef.current = nextTvMediaStateMap
      setParcelBuildSnapshotWorldId(enabled ? null : watchedParcelWorldIdRef.current)
      setParcelBuildNodeMap(nextBuildNodeMap)
      setParcelOwnershipMap(nextOwnershipMap)
      setTvMediaStateMap(nextTvMediaStateMap)
      setConnection(createConnectionDetails())
      return
    }

    let cancelled = false
    let reconnectTimer = 0
    let heartbeatTimer = 0

    const clearHeartbeat = () => {
      window.clearInterval(heartbeatTimer)
      heartbeatTimer = 0
    }

    const connect = () => {
      if (cancelled) return
      setParcelBuildSnapshotWorldId(null)
      setStatus(reconnectDelayRef.current > 1000 ? 'reconnecting' : 'connecting')
      setConnection((current) => ({
        ...current,
        connectionId: null,
        lastError: null,
        reconnectAttempt: reconnectAttemptRef.current,
      }))

      const socket = new WebSocket(resolveWebSocketUrl())
      socketRef.current = socket

      socket.addEventListener('open', () => {
        if (cancelled) return
        reconnectDelayRef.current = 1000
        reconnectAttemptRef.current = 0
        const player = latestPlayerRef.current ?? createStationaryPlayer(localProfile)
        const joined = spectator
          ? sendMessage({ roomId, type: 'watch' }, socket)
          : sendMessage({ player, roomId, type: 'join' }, socket)
        if (joined) {
          lastNetworkSentAtRef.current = window.performance.now()
          lastSentPlayerRef.current = player
        }
        const watchedParcelWorldId = watchedParcelWorldIdRef.current
        if (watchedParcelWorldId) {
          sendMessage({ roomId, type: 'watch-parcels', worldId: watchedParcelWorldId }, socket)
        }
        clearHeartbeat()
        heartbeatTimer = window.setInterval(() => {
          sendMessage({ sentAt: Date.now(), type: 'heartbeat' }, socket)
        }, heartbeatIntervalMsRef.current)
      })

      socket.addEventListener('message', (event) => {
        const message = parseServerMessage(event.data)
        if (!message) return

        if (message.type === 'welcome') {
          heartbeatIntervalMsRef.current = message.heartbeatIntervalMs
          setConnection((current) => ({
            ...current,
            connectionId: message.connectionId,
            heartbeatIntervalMs: message.heartbeatIntervalMs,
            lastError: null,
            maxPeers: message.maxPeers,
            stalePeerMs: message.stalePeerMs,
          }))
          return
        }

        if (message.type === 'error') {
          setConnection((current) => ({
            ...current,
            lastError: message.message,
          }))
          return
        }

        if (message.type === 'heartbeat') {
          const receivedAt = Date.now()
          if (typeof message.sentAt === 'number') {
            window.dispatchEvent(
              new CustomEvent<number>(MULTIPLAYER_LATENCY_EVENT, {
                detail: Math.max(0, receivedAt - message.sentAt),
              }),
            )
          }
          setConnection((current) => {
            const serverPlayerCount = message.playerCount ?? current.serverPlayerCount
            if (current.lastError === null && current.serverPlayerCount === serverPlayerCount) {
              return current
            }
            return {
              ...current,
              lastError: null,
              serverPlayerCount,
            }
          })
          return
        }

        if (message.type === 'voice-signal') {
          if (message.roomId !== roomId || message.from === localProfile.id) return
          onVoiceSignalRef.current?.({
            from: message.from,
            sequence: voiceSignalSequenceRef.current++,
            signal: message.signal,
          })
          return
        }

        if (message.type === 'parcel-claim-rejected') {
          if (message.roomId && message.roomId !== roomId) return
          setParcelClaimError({
            code: message.code,
            message: message.message,
            parcelId: message.parcelId,
            worldId: message.worldId,
          })
          return
        }

        if (message.roomId !== roomId) return

        if (message.type === 'parcel-ownership-snapshot') {
          if (message.worldId !== watchedParcelWorldIdRef.current) return
          setParcelOwnershipMap(
            new Map(message.ownerships.map((ownership) => [ownership.parcelId, ownership])),
          )
          setParcelClaimError(null)
          return
        }

        if (message.type === 'parcel-owned' || message.type === 'parcel-claim-result') {
          if (message.ownership.worldId !== watchedParcelWorldIdRef.current) return
          setParcelOwnershipMap((current) => {
            const next = new Map(current)
            next.set(message.ownership.parcelId, message.ownership)
            return next
          })
          setParcelClaimError(null)
          return
        }

        if (message.type === 'parcel-build-nodes-snapshot') {
          if (message.worldId !== watchedParcelWorldIdRef.current) return
          const nextBuildNodeMap = new Map(message.builds.map((build) => [build.parcelId, build]))
          parcelBuildNodeMapRef.current = nextBuildNodeMap
          setParcelBuildNodeMap(nextBuildNodeMap)
          setParcelBuildSnapshotWorldId(message.worldId)
          for (const [key, entry] of parcelBuildSyncQueueRef.current) {
            if (entry.worldId !== message.worldId) continue
            const acknowledgedBuild = nextBuildNodeMap.get(entry.parcelId)
            if (entry.inFlight && acknowledgedBuild?.operationId === entry.inFlight.operationId) {
              settleParcelBuildSync({
                operationId: entry.inFlight.operationId,
                parcelId: entry.parcelId,
                retry: false,
                worldId: entry.worldId,
              })
            } else {
              flushQueuedParcelBuildSync(key)
            }
          }
          return
        }

        if (message.type === 'tv-media-state-snapshot') {
          if (message.worldId !== watchedParcelWorldIdRef.current) return
          const receivedAt = Date.now()
          setTvMediaStateMap(
            new Map(
              message.tvs.map((tv) => {
                const normalized = normalizeTvMediaStateSnapshot(tv, message.serverTime, receivedAt)
                return [normalized.tvId, normalized]
              }),
            ),
          )
          return
        }

        if (
          message.type === 'parcel-build-nodes-synced' ||
          message.type === 'parcel-build-nodes-updated'
        ) {
          if (message.build.worldId !== watchedParcelWorldIdRef.current) return
          const currentBuild = parcelBuildNodeMapRef.current.get(message.build.parcelId)
          if (
            currentBuild?.worldId === message.build.worldId &&
            currentBuild.revision > message.build.revision
          ) {
            return
          }
          const nextBuildNodeMap = new Map(parcelBuildNodeMapRef.current)
          nextBuildNodeMap.set(message.build.parcelId, message.build)
          parcelBuildNodeMapRef.current = nextBuildNodeMap
          setParcelBuildNodeMap(nextBuildNodeMap)
          if (message.type === 'parcel-build-nodes-synced') {
            settleParcelBuildSync({
              operationId: message.build.operationId,
              parcelId: message.build.parcelId,
              retry: false,
              worldId: message.build.worldId,
            })
            setConnection((current) =>
              current.lastError === null ? current : { ...current, lastError: null },
            )
          }
          return
        }

        if (message.type === 'parcel-build-nodes-conflict') {
          const entry = [...parcelBuildSyncQueueRef.current.values()].find(
            (candidate) => candidate.inFlight?.operationId === message.operationId,
          )
          if (!entry || entry.worldId !== watchedParcelWorldIdRef.current) return
          const nextBuildNodeMap = new Map(parcelBuildNodeMapRef.current)
          if (message.build) nextBuildNodeMap.set(message.build.parcelId, message.build)
          else nextBuildNodeMap.delete(entry.parcelId)
          parcelBuildNodeMapRef.current = nextBuildNodeMap
          setParcelBuildNodeMap(nextBuildNodeMap)
          setConnection((current) => ({ ...current, lastError: message.reason }))
          settleParcelBuildSync({
            operationId: message.operationId,
            parcelId: entry.parcelId,
            retry: true,
            worldId: entry.worldId,
          })
          return
        }

        if (message.type === 'tv-media-state-synced' || message.type === 'tv-media-state-updated') {
          if (message.tv.worldId !== watchedParcelWorldIdRef.current) return
          const normalized = normalizeTvMediaStateSnapshot(message.tv, message.serverTime)
          setTvMediaStateMap((current) => {
            const next = new Map(current)
            next.set(normalized.tvId, normalized)
            return next
          })
          return
        }

        if (message.type === 'room-state') {
          setConnection((current) =>
            current.serverPlayerCount === message.playerCount
              ? current
              : { ...current, serverPlayerCount: message.playerCount },
          )
          return
        }

        if (message.type === 'snapshot') {
          setStatus('connected')
          const receivedAt = performance.now()
          const nextRemotePlayerMap = new Map<string, MultiplayerPlayerSnapshot>()
          const nextRemotePlayerTimelineMap = new Map<string, MultiplayerRemotePlayerTimeline>()
          for (const player of message.players) {
            if (player.id === localProfile.id) continue
            const reconciliation = reconcileRemotePresentationTimeline(
              remotePlayerTimelineMapRef.current.get(player.id) ?? null,
              player,
              message.serverTime,
              receivedAt,
            )
            nextRemotePlayerTimelineMap.set(player.id, reconciliation.timeline)
            nextRemotePlayerMap.set(
              player.id,
              reconciliation.accepted
                ? player
                : (remotePlayerMapRef.current.get(player.id) ?? player),
            )
          }
          remotePlayerMapRef.current = nextRemotePlayerMap
          remotePlayerTimelineMapRef.current = nextRemotePlayerTimelineMap
          setRemotePlayerRosterMap(new Map(nextRemotePlayerMap))
          renderScheduler.requestFrame('animation')
          setConnection((current) => {
            const serverPlayerCount = message.players.length + (spectator ? 0 : 1)
            return current.serverPlayerCount === serverPlayerCount
              ? current
              : { ...current, serverPlayerCount }
          })
          return
        }

        if (message.type === 'player-joined' || message.type === 'player-state') {
          if (message.player.id === localProfile.id) return
          const reconciliation = reconcileRemotePresentationTimeline(
            remotePlayerTimelineMapRef.current.get(message.player.id) ?? null,
            message.player,
            message.serverTime,
            performance.now(),
          )
          remotePlayerTimelineMapRef.current.set(message.player.id, reconciliation.timeline)
          if (!reconciliation.accepted) return
          const previous = remotePlayerMapRef.current.get(message.player.id)
          remotePlayerMapRef.current.set(message.player.id, message.player)
          if (!previous || remotePlayerRosterChanged(previous, message.player)) {
            setRemotePlayerRosterMap(new Map(remotePlayerMapRef.current))
          }
          renderScheduler.requestFrame('animation')
          return
        }

        if (message.type === 'player-left') {
          remotePlayerMapRef.current.delete(message.id)
          remotePlayerTimelineMapRef.current.delete(message.id)
          setRemotePlayerRosterMap(new Map(remotePlayerMapRef.current))
          renderScheduler.requestFrame('animation')
        }
      })

      socket.addEventListener('close', (event) => {
        clearHeartbeat()
        requeueInFlightParcelBuildSyncs()
        if (socketRef.current === socket) socketRef.current = null
        if (cancelled) return

        reconnectAttemptRef.current += 1
        setStatus('reconnecting')
        setConnection((current) => ({
          ...current,
          connectionId: null,
          lastError: event.reason || current.lastError,
          reconnectAttempt: reconnectAttemptRef.current,
        }))
        reconnectTimer = window.setTimeout(connect, reconnectDelayRef.current)
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30_000)
      })

      socket.addEventListener('error', () => {
        if (cancelled) return
        setStatus('reconnecting')
        setConnection((current) => ({
          ...current,
          lastError: 'WebSocket connection error',
        }))
      })
    }

    connect()

    return () => {
      cancelled = true
      window.clearTimeout(reconnectTimer)
      clearHeartbeat()
      const socket = socketRef.current
      socketRef.current = null
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'leave' }))
      }
      socket?.close()
    }
  }, [
    enabled,
    flushQueuedParcelBuildSync,
    localProfile,
    persistOfflineState,
    requeueInFlightParcelBuildSyncs,
    roomId,
    sendMessage,
    settleParcelBuildSync,
    spectator,
  ])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (status === 'connected') return
      const cutoff = Date.now() - REMOTE_PLAYER_STALE_MS
      const next = new Map(
        [...remotePlayerMapRef.current.entries()].filter(
          ([, player]) => player.updatedAt >= cutoff,
        ),
      )
      if (next.size === remotePlayerMapRef.current.size) return
      remotePlayerMapRef.current = next
      remotePlayerTimelineMapRef.current = new Map(
        [...remotePlayerTimelineMapRef.current.entries()].filter(([id]) => next.has(id)),
      )
      setRemotePlayerRosterMap(new Map(next))
    }, 3000)
    return () => window.clearInterval(interval)
  }, [status])

  return {
    claimParcel,
    connection,
    parcelBuildNodes,
    parcelBuildSnapshotWorldId,
    parcelClaimError,
    parcelOwnerships,
    publishLocalPlayer,
    remotePlayerStore,
    remotePlayers,
    sendVoiceSignal,
    syncParcelBuildNodes,
    syncTvMediaState,
    status,
    tvMediaStates,
    watchParcelWorld,
  }
}

function shouldSendPlayerSnapshot(
  player: MultiplayerPlayerSnapshot,
  previous: MultiplayerPlayerSnapshot | null,
  elapsedSinceLastSendMs: number,
) {
  if (!previous) return true
  if (elapsedSinceLastSendMs >= LOCAL_STATE_IDLE_SEND_INTERVAL_MS) return true
  if (player.name !== previous.name || player.color !== previous.color) return true
  if (player.moving !== previous.moving) return true
  if (player.pose !== previous.pose) return true
  if (Math.abs(player.speed - previous.speed) >= LOCAL_STATE_SPEED_EPSILON) return true
  if (angleDistance(player.heading, previous.heading) >= LOCAL_STATE_HEADING_EPSILON) return true

  return (
    distanceSquared3(player.position, previous.position) >=
    LOCAL_STATE_POSITION_EPSILON * LOCAL_STATE_POSITION_EPSILON
  )
}

function distanceSquared3(
  first: readonly [number, number, number],
  second: readonly [number, number, number],
) {
  const dx = first[0] - second[0]
  const dy = first[1] - second[1]
  const dz = first[2] - second[2]
  return dx * dx + dy * dy + dz * dz
}

function angleDistance(first: number, second: number) {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)))
}

function finiteNumber(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function createStationaryPlayer(profile: LocalPlayerProfile): MultiplayerPlayerSnapshot {
  return {
    ...profile,
    heading: 0,
    moving: false,
    position: [0, 0, 0],
    speed: 0,
    updatedAt: Date.now(),
  }
}

export function readLocalPlayerProfile(): LocalPlayerProfile {
  const stored = window.localStorage.getItem(PLAYER_STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as LocalPlayerProfile
      if (parsed.id && parsed.name && parsed.color) return parsed
    } catch {
      window.localStorage.removeItem(PLAYER_STORAGE_KEY)
    }
  }

  const id = createPlayerId()
  const color = PLAYER_COLORS[hashString(id) % PLAYER_COLORS.length] ?? PLAYER_COLORS[0]
  const profile = {
    color,
    id,
    name: `Builder ${id.slice(0, 4).toUpperCase()}`,
  }
  window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(profile))
  return profile
}

function readOfflineParcelWorldState(worldId: string | null) {
  if (!worldId) return null
  const state = readOfflineParcelStateStore()[worldId]
  if (!state) return { builds: [], ownerships: [], tvMediaStates: [] }

  return {
    builds: Array.isArray(state.builds)
      ? state.builds
          .map((build) => normalizeParcelBuildNodesSnapshot(build, worldId))
          .filter((build): build is ParcelBuildNodesSnapshot => build !== null)
      : [],
    ownerships: Array.isArray(state.ownerships)
      ? state.ownerships.filter(
          (ownership) => ownership?.worldId === worldId && typeof ownership.parcelId === 'string',
        )
      : [],
    tvMediaStates: Array.isArray(state.tvMediaStates)
      ? state.tvMediaStates
          .filter((tv) => tv?.worldId === worldId && typeof tv.tvId === 'string')
          .map((tv) => normalizeTvMediaStateSnapshot(tv, Date.now()))
      : [],
  }
}

export function writeOfflineParcelWorldState(
  worldId: string,
  ownerships: readonly ParcelOwnership[],
  builds: readonly ParcelBuildNodesSnapshot[],
  tvMediaStates: readonly TvMediaStateSnapshot[],
) {
  const store = readOfflineParcelStateStore()
  store[worldId] = {
    builds: builds.filter((build) => build.worldId === worldId),
    ownerships: ownerships.filter((ownership) => ownership.worldId === worldId),
    tvMediaStates: tvMediaStates.filter((tv) => tv.worldId === worldId),
  }
  try {
    window.localStorage.setItem(OFFLINE_PARCEL_STATE_STORAGE_KEY, JSON.stringify(store))
  } catch {
    window.localStorage.removeItem(OFFLINE_PARCEL_STATE_STORAGE_KEY)
  }
}

function readOfflineParcelStateStore(): OfflineParcelStateStore {
  const stored = window.localStorage.getItem(OFFLINE_PARCEL_STATE_STORAGE_KEY)
  if (!stored) return {}
  try {
    const parsed = JSON.parse(stored) as OfflineParcelStateStore
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    window.localStorage.removeItem(OFFLINE_PARCEL_STATE_STORAGE_KEY)
    return {}
  }
}

function createPlayerId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `player-${Math.random().toString(36).slice(2, 10)}`
}

function hashString(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

export function sanitizeRoomId(roomId: string) {
  return sanitizeMultiplayerRoomId(roomId)
}

function resolveWebSocketUrl() {
  const explicitUrl = new URLSearchParams(window.location.search).get('ws')
  if (explicitUrl) return normalizeWebSocketUrl(explicitUrl)

  const url = new URL('/api/landrush-lab/world-multiplayer/ws', window.location.href)
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    url.port = '3003'
    url.protocol = 'ws:'
    return url.toString()
  }

  if (HOSTED_MULTIPLAYER_WEBSOCKET_URL) {
    return normalizeWebSocketUrl(HOSTED_MULTIPLAYER_WEBSOCKET_URL)
  }

  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function normalizeWebSocketUrl(rawUrl: string) {
  const url = new URL(rawUrl, window.location.href)
  if (url.protocol === 'https:') url.protocol = 'wss:'
  if (url.protocol === 'http:') url.protocol = 'ws:'
  return url.toString()
}

function parseServerMessage(data: unknown): ServerMessage | null {
  try {
    const message = JSON.parse(String(data)) as ServerMessage
    if (
      message?.type === 'welcome' &&
      typeof message.connectionId === 'string' &&
      typeof message.heartbeatIntervalMs === 'number'
    ) {
      return message
    }
    if (
      message?.type === 'snapshot' &&
      Array.isArray(message.players) &&
      message.players.every(isPlayerSnapshot) &&
      typeof message.roomId === 'string' &&
      typeof message.serverTime === 'number'
    ) {
      return message
    }
    if (
      (message?.type === 'player-joined' || message?.type === 'player-state') &&
      isPlayerSnapshot(message.player) &&
      typeof message.roomId === 'string' &&
      typeof message.serverTime === 'number'
    ) {
      return message
    }
    if (
      message?.type === 'voice-signal' &&
      typeof message.from === 'string' &&
      typeof message.roomId === 'string' &&
      isSpatialVoiceSignalPayload(message.signal)
    ) {
      return message
    }
    if (
      message?.type === 'player-left' &&
      typeof message.id === 'string' &&
      typeof message.roomId === 'string' &&
      typeof message.serverTime === 'number'
    ) {
      return message
    }
    if (
      message?.type === 'parcel-ownership-snapshot' &&
      typeof message.roomId === 'string' &&
      typeof message.worldId === 'string' &&
      Array.isArray(message.ownerships) &&
      message.ownerships.every(isParcelOwnership)
    ) {
      return message
    }
    if (
      message?.type === 'parcel-build-nodes-snapshot' &&
      typeof message.roomId === 'string' &&
      typeof message.worldId === 'string' &&
      Array.isArray(message.builds) &&
      message.builds.every(isParcelBuildNodesSnapshot)
    ) {
      return message
    }
    if (
      message?.type === 'tv-media-state-snapshot' &&
      typeof message.roomId === 'string' &&
      typeof message.serverTime === 'number' &&
      typeof message.worldId === 'string' &&
      Array.isArray(message.tvs) &&
      message.tvs.every(isTvMediaStateSnapshot)
    ) {
      return message
    }
    if (
      (message?.type === 'parcel-build-nodes-synced' ||
        message?.type === 'parcel-build-nodes-updated') &&
      typeof message.roomId === 'string' &&
      isParcelBuildNodesSnapshot(message.build)
    ) {
      return message
    }
    if (
      message?.type === 'parcel-build-nodes-conflict' &&
      typeof message.operationId === 'string' &&
      typeof message.reason === 'string' &&
      typeof message.roomId === 'string' &&
      typeof message.serverTime === 'number' &&
      (message.build === null || isParcelBuildNodesSnapshot(message.build))
    ) {
      return message
    }
    if (
      (message?.type === 'tv-media-state-synced' || message?.type === 'tv-media-state-updated') &&
      typeof message.roomId === 'string' &&
      typeof message.serverTime === 'number' &&
      isTvMediaStateSnapshot(message.tv)
    ) {
      return message
    }
    if (
      (message?.type === 'parcel-owned' || message?.type === 'parcel-claim-result') &&
      typeof message.roomId === 'string' &&
      isParcelOwnership(message.ownership)
    ) {
      return message
    }
    if (
      message?.type === 'parcel-claim-rejected' &&
      typeof message.code === 'string' &&
      typeof message.message === 'string'
    ) {
      return message
    }
    if (
      message?.type === 'room-state' &&
      typeof message.roomId === 'string' &&
      typeof message.playerCount === 'number'
    ) {
      return message
    }
    if (message?.type === 'heartbeat' && typeof message.serverTime === 'number') return message
    if (
      message?.type === 'error' &&
      typeof message.code === 'string' &&
      typeof message.message === 'string'
    ) {
      return message
    }
  } catch {
    return null
  }
  return null
}

function isParcelOwnership(value: unknown): value is ParcelOwnership {
  const ownership = value as ParcelOwnership
  return (
    typeof ownership?.claimedAt === 'number' &&
    typeof ownership.parcelId === 'string' &&
    typeof ownership.worldId === 'string' &&
    typeof ownership.owner?.id === 'string' &&
    typeof ownership.owner.name === 'string' &&
    typeof ownership.owner.color === 'string'
  )
}

function isParcelBuildNodesSnapshot(value: unknown): value is ParcelBuildNodesSnapshot {
  const build = value as ParcelBuildNodesSnapshot
  return (
    typeof build?.parcelId === 'string' &&
    typeof build.operationId === 'string' &&
    build.operationId.length > 0 &&
    Number.isSafeInteger(build.revision) &&
    build.revision >= 0 &&
    isParcelBuildSchemaVersion(build.schemaVersion) &&
    typeof build.updatedAt === 'number' &&
    typeof build.updatedBy === 'string' &&
    typeof build.worldId === 'string' &&
    Array.isArray(build.nodes) &&
    build.nodes.every(isSyncedBuildNode)
  )
}

function normalizeParcelBuildNodesSnapshot(
  value: unknown,
  expectedWorldId: string,
): ParcelBuildNodesSnapshot | null {
  const build = value as Partial<ParcelBuildNodesSnapshot>
  if (
    typeof build?.parcelId !== 'string' ||
    typeof build.updatedAt !== 'number' ||
    typeof build.updatedBy !== 'string' ||
    build.worldId !== expectedWorldId ||
    !Array.isArray(build.nodes) ||
    !build.nodes.every(isSyncedBuildNode)
  ) {
    return null
  }

  const revision = normalizeParcelBuildRevision(build.revision)
  return {
    nodes: build.nodes,
    operationId:
      typeof build.operationId === 'string' && build.operationId
        ? build.operationId
        : `offline-migrated-${build.parcelId}-${revision}`,
    parcelId: build.parcelId,
    revision,
    schemaVersion: PARCEL_BUILD_SCHEMA_VERSION,
    updatedAt: build.updatedAt,
    updatedBy: build.updatedBy,
    worldId: expectedWorldId,
  }
}

function normalizeTvMediaStateSnapshot(
  value: TvMediaStateSnapshot,
  serverTime: number,
  receivedAt = Date.now(),
): TvMediaStateSnapshot {
  const tv = value as TvMediaStateSnapshot & Partial<TvMediaStateSnapshot>
  const playbackUpdatedAt = finiteNumber(tv.playbackUpdatedAt, serverTime)
  const playbackSeconds = Math.max(0, finiteNumber(tv.playbackSeconds, 0))
  const playing = typeof tv.playing === 'boolean' ? tv.playing : Boolean(tv.url)
  const elapsedSeconds =
    playing && playbackUpdatedAt > 0 ? Math.max(0, serverTime - playbackUpdatedAt) / 1000 : 0

  return {
    ...value,
    playbackSeconds: playbackSeconds + elapsedSeconds,
    playbackUpdatedAt: receivedAt,
    playing,
  }
}

function isTvMediaStateSnapshot(value: unknown): value is TvMediaStateSnapshot {
  const tv = value as TvMediaStateSnapshot
  const playbackSeconds = (tv as Partial<TvMediaStateSnapshot>).playbackSeconds
  const playbackUpdatedAt = (tv as Partial<TvMediaStateSnapshot>).playbackUpdatedAt
  const playing = (tv as Partial<TvMediaStateSnapshot>).playing
  return (
    typeof tv?.muted === 'boolean' &&
    typeof tv.parcelId === 'string' &&
    (playbackSeconds === undefined || typeof playbackSeconds === 'number') &&
    (playbackUpdatedAt === undefined || typeof playbackUpdatedAt === 'number') &&
    (playing === undefined || typeof playing === 'boolean') &&
    typeof tv.tvId === 'string' &&
    typeof tv.updatedAt === 'number' &&
    typeof tv.updatedBy === 'string' &&
    typeof tv.url === 'string' &&
    typeof tv.userVolume === 'number' &&
    typeof tv.worldId === 'string'
  )
}

function isSyncedBuildNode(value: unknown): value is ParcelBuildNode {
  const node = value as ParcelBuildNode
  return typeof node?.id === 'string' && typeof node.type === 'string'
}

function isPlayerSnapshot(value: unknown): value is MultiplayerPlayerSnapshot {
  const player = value as MultiplayerPlayerSnapshot
  return (
    typeof player?.id === 'string' &&
    typeof player.name === 'string' &&
    typeof player.color === 'string' &&
    Array.isArray(player.position) &&
    player.position.length === 3 &&
    typeof player.heading === 'number' &&
    typeof player.speed === 'number' &&
    typeof player.moving === 'boolean' &&
    (player.pose === undefined || player.pose === 'falling') &&
    typeof player.updatedAt === 'number'
  )
}

function cloneParcelBuildNodes(nodes: readonly ParcelBuildNode[]) {
  return nodes.map((node) => structuredClone(node))
}

function createParcelBuildOperationId() {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `parcel-build-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function parcelBuildSyncKey(worldId: string, parcelId: string) {
  return `${worldId}:${parcelId}`
}
