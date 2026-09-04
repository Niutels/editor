'use client'

import {
  type ConnectionStatus,
  calculateParcelBuildPriceDelta,
  isMultiplayerPlayerCombatSnapshot,
  isMultiplayerPlayerPose,
  isMultiplayerZombieEscapeStateSnapshot,
  isParcelWriterEpoch,
  isProfileWalletSnapshot,
  isSpatialVoiceSignalPayload,
  isSupportedParcelBuildSchemaVersion,
  LEGACY_PARCEL_BUILD_SCHEMA_VERSION,
  type LocalPlayerProfile,
  MAX_PROFILE_MONEY,
  type MultiplayerPlayerCombatSnapshot,
  type MultiplayerPlayerSnapshot,
  type MultiplayerZombieEscapeStateSnapshot,
  normalizeParcelBuildRevision,
  PARCEL_BUILD_SCHEMA_VERSION,
  PARCEL_WRITER_SESSION_CLOSE_CODE,
  type ParcelBuildNode,
  type ParcelBuildNodesAckMessage,
  type ParcelBuildNodesRejectedMessage,
  type ParcelBuildPriceDeltaResult,
  type ParcelBuildSnapshot,
  type ParcelClaimError,
  type ParcelOwnership,
  type ProfileWalletSnapshot,
  type SpatialVoiceSignalMessage,
  type SpatialVoiceSignalPayload,
  sanitizeMultiplayerRoomId,
  sanitizeParcelWriterSessionId,
  sanitizeProfileMoneyOperationId,
  type TvMediaStateSnapshot,
  ZOMBIE_ESCAPE_KILL_REWARD,
} from '@landrush/protocol'
import {
  isZombieGameSnapshot,
  isZombieGameStatus,
  type ZombieGameSnapshot,
  type ZombieGameStatus,
} from '@landrush/protocol/zombie-game'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  type RemotePresentationStore,
  type RemotePresentationTimeline,
  reconcileRemotePresentationTimeline,
  resolveRemotePresentationSnapshot,
} from './multiplayer-presentation'
import {
  advanceMultiplayerTransportScopeGeneration,
  createMultiplayerTransportScopeGeneration,
  isMultiplayerTransportCallbackCurrent,
  isMultiplayerTransportSessionCallbackCurrent,
} from './multiplayer-transport-generation'
import {
  createClaimedParcelBuildAuthorityUpdate,
  isParcelBuildContentUpdateAuthorityCurrent,
  type ParcelBuildContentAuthority,
  ParcelBuildContentAuthorityEpoch,
  resolveLocalParcelBuildContentAuthority,
  shouldRefreshParcelBuildAuthorityAfterClaim,
} from './parcel-build-content-authority'
import { type ParcelBuildSyncConflict, ParcelBuildSyncQueue } from './parcel-build-sync-queue'
import { renderScheduler } from './render-scheduler'
import { resolveWorldMultiplayerWebSocketUrl } from './world-multiplayer-websocket-url'
import { createMultiplayerZombieGameClient } from './zombie-game-client'

export type MultiplayerRemotePlayerStore = RemotePresentationStore<MultiplayerPlayerSnapshot>

type MultiplayerRemotePlayerTimeline = RemotePresentationTimeline<MultiplayerPlayerSnapshot>

export type ParcelBuildNodesSnapshot = ParcelBuildSnapshot<ParcelBuildNode>

export type LandrushWorldContentAuthority = ParcelBuildContentAuthority

export type LandrushWorldMultiplayerGameMode = 'zombie-escape' | null

export type MultiplayerZombieEscapeStateObservation = Readonly<{
  receivedAtMs: number
  serverTime: number
  state: MultiplayerZombieEscapeStateSnapshot
  transportGeneration: number
}>

export type ProfileMoneyOperationRequest =
  | { kind: 'zombie-kill-reward'; operationId?: string }
  | { cost: number; kind: 'weapon-purchase'; operationId?: string }

export type ProfileMoneyState = ProfileWalletSnapshot & {
  canonicalBalance: number
  pendingBuildCost: number
  pendingOperationCount: number
  status: 'pending' | 'stale' | 'synced'
}

export type ParcelBuildAdmissionReason =
  | 'build-authority-unavailable'
  | 'build-price-limit'
  | 'insufficient-funds'
  | 'profile-money-stale'
  | 'profile-money-unavailable'
  | 'unpriced-build-node'

export type ParcelBuildNodesQuote = Readonly<{
  allowed: boolean
  availableBalance: number | null
  cost: number | null
  existingPendingBuildCost: number | null
  newPendingBuildCost: number | null
  reason: ParcelBuildAdmissionReason | null
  remainingBalance: number | null
}>

type PendingParcelBuildCostProjection =
  | { cost: number; ok: true }
  | {
      code: Extract<
        ParcelBuildAdmissionReason,
        'build-authority-unavailable' | 'build-price-limit' | 'unpriced-build-node'
      >
      message: string
      ok: false
    }

export function calculateParcelBuildReservationCost({
  authoritativeNodes,
  inFlightNodes,
  pendingNodes,
}: {
  authoritativeNodes: readonly ParcelBuildNode[]
  inFlightNodes: readonly ParcelBuildNode[] | null
  pendingNodes: readonly ParcelBuildNode[] | null
}): ParcelBuildPriceDeltaResult {
  let baselineNodes = authoritativeNodes
  let cost = 0
  if (inFlightNodes !== null) {
    const inFlightPrice = calculateParcelBuildPriceDelta(authoritativeNodes, inFlightNodes)
    if (!inFlightPrice.ok) return inFlightPrice
    cost = inFlightPrice.cost
    baselineNodes = inFlightNodes
  }
  if (pendingNodes !== null) {
    const pendingPrice = calculateParcelBuildPriceDelta(baselineNodes, pendingNodes)
    if (!pendingPrice.ok) return pendingPrice
    cost += pendingPrice.cost
  }
  if (!Number.isSafeInteger(cost) || cost > MAX_PROFILE_MONEY) {
    return {
      code: 'build-price-limit',
      message: 'Build price exceeds the supported profile-money limit',
      ok: false,
    }
  }
  return { cost, ok: true }
}

export function resolveParcelBuildNodesQuote({
  authorityKnown,
  existingPendingBuildCost,
  newPendingBuildCost,
  pricingFailure,
  profileBalanceBeforeBuildReservations,
  profileMoneyFresh,
}: {
  authorityKnown: boolean
  existingPendingBuildCost: number | null
  newPendingBuildCost: number | null
  pricingFailure: Extract<
    ParcelBuildAdmissionReason,
    'build-authority-unavailable' | 'build-price-limit' | 'unpriced-build-node'
  > | null
  profileBalanceBeforeBuildReservations: number | null
  profileMoneyFresh: boolean
}): ParcelBuildNodesQuote {
  if (!authorityKnown) {
    return {
      allowed: false,
      availableBalance: null,
      cost: null,
      existingPendingBuildCost,
      newPendingBuildCost,
      reason: 'build-authority-unavailable',
      remainingBalance: null,
    }
  }
  if (
    pricingFailure ||
    !isPendingBuildCost(existingPendingBuildCost) ||
    !isPendingBuildCost(newPendingBuildCost)
  ) {
    return {
      allowed: false,
      availableBalance: null,
      cost: null,
      existingPendingBuildCost,
      newPendingBuildCost,
      reason: pricingFailure ?? 'build-price-limit',
      remainingBalance: null,
    }
  }

  const cost = Math.max(0, newPendingBuildCost - existingPendingBuildCost)
  const availableBalance =
    profileBalanceBeforeBuildReservations === null
      ? null
      : Math.max(0, profileBalanceBeforeBuildReservations - existingPendingBuildCost)
  const remainingBalance =
    profileBalanceBeforeBuildReservations !== null &&
    profileBalanceBeforeBuildReservations >= newPendingBuildCost
      ? profileBalanceBeforeBuildReservations - newPendingBuildCost
      : null
  if (cost === 0) {
    return {
      allowed: true,
      availableBalance,
      cost,
      existingPendingBuildCost,
      newPendingBuildCost,
      reason: null,
      remainingBalance,
    }
  }
  if (profileBalanceBeforeBuildReservations === null) {
    return {
      allowed: false,
      availableBalance: null,
      cost,
      existingPendingBuildCost,
      newPendingBuildCost,
      reason: 'profile-money-unavailable',
      remainingBalance: null,
    }
  }
  if (!profileMoneyFresh) {
    return {
      allowed: false,
      availableBalance,
      cost,
      existingPendingBuildCost,
      newPendingBuildCost,
      reason: 'profile-money-stale',
      remainingBalance: null,
    }
  }
  if (availableBalance === null || availableBalance < cost) {
    return {
      allowed: false,
      availableBalance,
      cost,
      existingPendingBuildCost,
      newPendingBuildCost,
      reason: 'insufficient-funds',
      remainingBalance: null,
    }
  }
  return {
    allowed: true,
    availableBalance,
    cost,
    existingPendingBuildCost,
    newPendingBuildCost,
    reason: null,
    remainingBalance,
  }
}

function isPendingBuildCost(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0 && value <= MAX_PROFILE_MONEY
}

type QueuedProfileMoneyOperation = (
  | { kind: 'zombie-kill-reward' }
  | { cost: number; kind: 'weapon-purchase' }
) & {
  lastSentAt: number | null
  lastSentConnectionId: string | null
  operationId: string
}

export type ParcelBuildContentUpdate = {
  build: ParcelBuildNodesSnapshot | null
  localDesiredNodes?: ParcelBuildNode[]
  parcelId: string
  rejectedOperationId?: string | null
  sequence: number
  source: 'conflict' | 'insufficient-funds' | 'remote' | 'snapshot'
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
  | ZombieGameSnapshot
  | ZombieGameStatus
  | {
      connectionId: string
      heartbeatIntervalMs: number
      maxPeers: number
      serverTime: number
      stalePeerMs: number
      type: 'welcome'
      zombieGameAuthority?: { schemaVersion: number }
    }
  | {
      players: MultiplayerPlayerSnapshot[]
      roomId: string
      serverTime: number
      type: 'snapshot'
      zombieEscapeState?: MultiplayerZombieEscapeStateSnapshot
    }
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
      type: 'parcel-build-nodes-updated'
    }
  | (ParcelBuildNodesAckMessage & { wallet?: ProfileWalletSnapshot })
  | ParcelBuildNodesRejectedMessage
  | {
      build: ParcelBuildNodesSnapshot | null
      operationId: string
      parcelId: string
      reason: string
      roomId: string
      serverTime: number
      type: 'parcel-build-nodes-conflict'
      worldId: string
    }
  | {
      build: ParcelBuildNodesSnapshot | null
      cost: number
      operationId: string
      parcelId: string
      reason: string
      roomId: string
      serverTime: number
      type: 'parcel-build-nodes-insufficient-funds'
      wallet: ProfileWalletSnapshot
      worldId: string
    }
  | {
      roomId: string
      serverTime: number
      type: 'parcel-writer-session-granted'
      writerEpoch: number
      writerSessionId: string
    }
  | {
      code: string
      message: string
      roomId?: string
      serverTime: number
      type: 'parcel-writer-session-rejected'
      writerSessionId: string
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
      serverTime: number
      type: 'profile-money-snapshot'
      wallet: ProfileWalletSnapshot
    }
  | {
      duplicate: boolean
      operationId: string
      serverTime: number
      type: 'profile-money-operation-ack'
      wallet: ProfileWalletSnapshot
    }
  | {
      code: string
      message: string
      operationId: string
      serverTime: number
      type: 'profile-money-operation-rejected'
      wallet: ProfileWalletSnapshot
    }
  | {
      roomId: string
      serverTime: number
      state: MultiplayerZombieEscapeStateSnapshot
      type: 'zombie-escape-state-updated'
    }
  | {
      code: string
      message: string
      roomId: string
      serverTime: number
      state: MultiplayerZombieEscapeStateSnapshot
      type: 'zombie-escape-state-rejected'
    }
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

const PARCEL_BUILD_ACK_RETRY_MS = 5_000

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

export function remotePlayerRosterChanged(
  previous: MultiplayerPlayerSnapshot,
  next: MultiplayerPlayerSnapshot,
) {
  return (
    previous.name !== next.name ||
    previous.color !== next.color ||
    previous.pose !== next.pose ||
    Boolean(previous.combat) !== Boolean(next.combat)
  )
}

export function useLandrushWorldMultiplayer({
  contentAuthority,
  gameMode,
  localProfile,
  onVoiceSignal,
  persistOfflineState = true,
  roomId,
  spectator,
  zombieGameAuthority = false,
}: {
  contentAuthority: LandrushWorldContentAuthority
  gameMode: LandrushWorldMultiplayerGameMode
  localProfile: LocalPlayerProfile
  onVoiceSignal?: (message: SpatialVoiceSignalMessage) => void
  persistOfflineState?: boolean
  roomId: string
  spectator: boolean
  zombieGameAuthority?: boolean
}) {
  const onlineEnabled = contentAuthority === 'online'
  const offlineAuthority = contentAuthority === 'offline'
  const [watchedParcelWorldId, setWatchedParcelWorldId] = useState<string | null>(null)
  const transportScopeGenerationRef = useRef(
    createMultiplayerTransportScopeGeneration({
      contentAuthority,
      gameMode,
      localProfileId: localProfile.id,
      parcelWorldId: watchedParcelWorldId,
      roomId,
      spectator,
    }),
  )
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
  const parcelBuildContentAuthorityRef = useRef<ParcelBuildContentAuthorityEpoch | null>(null)
  if (!parcelBuildContentAuthorityRef.current) {
    parcelBuildContentAuthorityRef.current = new ParcelBuildContentAuthorityEpoch({
      contentAuthority,
      localProfileId: localProfile.id,
      roomId,
    })
  }
  const parcelBuildSyncQueueRef = useRef<ParcelBuildSyncQueue | null>(null)
  if (!parcelBuildSyncQueueRef.current) {
    parcelBuildSyncQueueRef.current = new ParcelBuildSyncQueue(createParcelBuildOperationId)
  }
  const parcelBuildUpdateSequenceRef = useRef(0)
  const transportConnectionIdRef = useRef<string | null>(null)
  const writerSessionRef = useRef<{ writerEpoch: number; writerSessionId: string } | null>(null)
  const writerLeaseEpochRef = useRef<number | null>(null)
  const writerSessionIdRef = useRef<string | null>(null)
  if (!writerSessionIdRef.current) writerSessionIdRef.current = createParcelWriterSessionId()
  const terminalWriterSessionRef = useRef(false)
  const canonicalProfileWalletRef = useRef<ProfileWalletSnapshot | null>(null)
  const pendingProfileMoneyOperationsRef = useRef<QueuedProfileMoneyOperation[]>([])
  const profileMoneyFreshRef = useRef(false)
  const profileMoneyOwnerRef = useRef(localProfile.id)
  const remotePlayerMapRef = useRef<Map<string, MultiplayerPlayerSnapshot>>(new Map())
  const remotePlayerTimelineMapRef = useRef<Map<string, MultiplayerRemotePlayerTimeline>>(new Map())
  const [connection, setConnection] =
    useState<MultiplayerConnectionDetails>(createConnectionDetails)
  const [status, setStatus] = useState<ConnectionStatus>(
    offlineAuthority ? 'offline' : 'connecting',
  )
  const zombieEscapeStateObservationRef = useRef<MultiplayerZombieEscapeStateObservation | null>(
    null,
  )
  const [zombieEscapeStateObservation, setZombieEscapeStateObservation] =
    useState<MultiplayerZombieEscapeStateObservation | null>(null)
  const [remotePlayerRosterMap, setRemotePlayerRosterMap] = useState<
    Map<string, MultiplayerPlayerSnapshot>
  >(() => new Map())
  const [parcelClaimError, setParcelClaimError] = useState<ParcelClaimError | null>(null)
  const [profileMoney, setProfileMoney] = useState<ProfileMoneyState | null>(null)
  const [parcelOwnershipMap, setParcelOwnershipMap] = useState<Map<string, ParcelOwnership>>(
    () => new Map(),
  )
  const [parcelBuildNodeMap, setParcelBuildNodeMap] = useState<
    Map<string, ParcelBuildNodesSnapshot>
  >(() => new Map())
  const [parcelBuildUpdateMap, setParcelBuildUpdateMap] = useState<
    Map<string, ParcelBuildContentUpdate>
  >(() => new Map())
  const [parcelBuildSnapshotWorldId, setParcelBuildSnapshotWorldId] = useState<string | null>(null)
  const [parcelBuildContentAuthorityEpoch, setParcelBuildContentAuthorityEpoch] = useState(0)
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
  const parcelBuildUpdates = useMemo(
    () =>
      [...parcelBuildUpdateMap.values()].sort((first, second) => first.sequence - second.sequence),
    [parcelBuildUpdateMap],
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

  const zombieGameClient = useMemo(
    () =>
      createMultiplayerZombieGameClient({
        enabled: zombieGameAuthority && gameMode === 'zombie-escape' && !spectator,
        unavailableReason:
          contentAuthority === 'offline'
            ? 'Shared Zombie gameplay requires an online connection; offline mode is enabled.'
            : null,
        readScope: () => ({
          roomId,
          playerId: localProfile.id,
          worldId: watchedParcelWorldIdRef.current,
          transportGeneration: transportScopeGenerationRef.current.generation,
        }),
        send: (message) => sendMessage(message) === true,
        onChange: () => renderScheduler.requestFrame('animation'),
      }),
    [
      contentAuthority,
      gameMode,
      localProfile.id,
      roomId,
      sendMessage,
      spectator,
      zombieGameAuthority,
    ],
  )

  const projectPendingParcelBuildCost = useCallback(
    (
      proposal: Readonly<{
        nodes: readonly ParcelBuildNode[]
        parcelId: string
        worldId: string
      }> | null = null,
    ): PendingParcelBuildCostProjection => {
      const worldId = watchedParcelWorldIdRef.current
      if (!worldId) return { cost: 0, ok: true }
      if (proposal && proposal.worldId !== worldId) {
        return {
          code: 'build-authority-unavailable',
          message: 'Parcel build authority is not available for the proposed world',
          ok: false,
        }
      }

      const queue = parcelBuildSyncQueueRef.current!
      const parcelIds = new Set(queue.parcelIds(worldId))
      if (proposal) parcelIds.add(proposal.parcelId)
      let cost = 0
      for (const parcelId of parcelIds) {
        const build = parcelBuildNodeMapRef.current.get(parcelId)
        const authoritativeBuild = build?.worldId === worldId ? build : null
        const authoritativeRevision = authoritativeBuild?.revision ?? 0
        const queued = queue.inspectReservation(worldId, parcelId)
        if (queued && queued.authoritativeRevision !== authoritativeRevision) {
          return {
            code: 'build-authority-unavailable',
            message: `Parcel ${parcelId} build authority changed while local work was pending`,
            ok: false,
          }
        }
        const reservation = calculateParcelBuildReservationCost({
          authoritativeNodes: authoritativeBuild?.nodes ?? [],
          inFlightNodes: queued?.inFlightNodes ?? null,
          pendingNodes:
            proposal?.parcelId === parcelId ? proposal.nodes : (queued?.pendingNodes ?? null),
        })
        if (!reservation.ok) return reservation
        cost += reservation.cost
        if (!Number.isSafeInteger(cost) || cost > MAX_PROFILE_MONEY) {
          return {
            code: 'build-price-limit',
            message: 'Pending build reservations exceed the supported profile-money limit',
            ok: false,
          }
        }
      }
      return { cost, ok: true }
    },
    [],
  )

  const projectCurrentProfileMoney = useCallback(() => {
    const wallet = canonicalProfileWalletRef.current
    if (!wallet) return null
    const pendingBuild = projectPendingParcelBuildCost()
    if (!pendingBuild.ok) return null
    const balance = projectProfileMoneyBalanceAfterBuildReservations(
      wallet.balance,
      pendingProfileMoneyOperationsRef.current,
      pendingBuild.cost,
    )
    return balance === null ? null : { balance, pendingBuildCost: pendingBuild.cost }
  }, [projectPendingParcelBuildCost])

  const publishProfileMoney = useCallback(() => {
    const wallet = canonicalProfileWalletRef.current
    if (!wallet) {
      setProfileMoney(null)
      return null
    }
    const projection = projectCurrentProfileMoney()
    if (!projection) {
      setProfileMoney(null)
      return null
    }
    const pendingOperationCount = pendingProfileMoneyOperationsRef.current.length
    const next = {
      ...wallet,
      balance: projection.balance,
      canonicalBalance: wallet.balance,
      pendingBuildCost: projection.pendingBuildCost,
      pendingOperationCount,
      status: profileMoneyFreshRef.current
        ? pendingOperationCount > 0 || projection.pendingBuildCost > 0
          ? ('pending' as const)
          : ('synced' as const)
        : ('stale' as const),
    }
    setProfileMoney(next)
    return next
  }, [projectCurrentProfileMoney])

  const flushProfileMoneyOperation = useCallback(() => {
    const operation = pendingProfileMoneyOperationsRef.current[0]
    const wallet = canonicalProfileWalletRef.current
    const writerSession = writerSessionRef.current
    const connectionId = transportConnectionIdRef.current
    const socket = socketRef.current
    if (
      !onlineEnabled ||
      spectator ||
      terminalWriterSessionRef.current ||
      !operation ||
      !wallet ||
      !writerSession ||
      !connectionId ||
      !socket
    ) {
      return false
    }
    const now = Date.now()
    if (
      operation.lastSentConnectionId === connectionId &&
      operation.lastSentAt !== null &&
      now - operation.lastSentAt < PARCEL_BUILD_ACK_RETRY_MS
    ) {
      return false
    }
    const sent = sendMessage(
      {
        operation: {
          baseRevision: wallet.revision,
          ...(operation.kind === 'weapon-purchase' ? { cost: operation.cost } : {}),
          kind: operation.kind,
          operationId: operation.operationId,
        },
        type: 'apply-profile-money-operation',
        ...writerSession,
      },
      socket,
    )
    if (!sent) return false
    operation.lastSentAt = now
    operation.lastSentConnectionId = connectionId
    const transportGeneration = transportScopeGenerationRef.current.generation
    window.setTimeout(() => {
      if (
        !isMultiplayerTransportSessionCallbackCurrent({
          capturedConnectionId: connectionId,
          capturedGeneration: transportGeneration,
          currentConnectionId: transportConnectionIdRef.current,
          currentGeneration: transportScopeGenerationRef.current.generation,
          currentTransport: socketRef.current,
          transport: socket,
        })
      ) {
        return
      }
      flushProfileMoneyOperation()
    }, PARCEL_BUILD_ACK_RETRY_MS)
    return true
  }, [onlineEnabled, sendMessage, spectator])

  const applyProfileMoneyOperation = useCallback(
    (request: ProfileMoneyOperationRequest) => {
      if (zombieGameClient.enabled) return null
      if (!onlineEnabled || spectator || terminalWriterSessionRef.current) return null
      if (
        request.kind === 'weapon-purchase' &&
        (!Number.isSafeInteger(request.cost) ||
          request.cost <= 0 ||
          request.cost > MAX_PROFILE_MONEY)
      ) {
        return null
      }
      const operationId = sanitizeProfileMoneyOperationId(
        request.operationId ?? createProfileMoneyOperationId(),
      )
      if (!operationId) return null
      const existing = pendingProfileMoneyOperationsRef.current.find(
        (operation) => operation.operationId === operationId,
      )
      if (existing) {
        if (
          existing.kind !== request.kind ||
          (request.kind === 'weapon-purchase' &&
            (existing.kind !== 'weapon-purchase' || existing.cost !== request.cost))
        ) {
          return null
        }
        return projectCurrentProfileMoney()?.balance ?? null
      }
      const wallet = canonicalProfileWalletRef.current
      if (!wallet && request.kind === 'weapon-purchase') return null
      if (wallet) {
        const currentBalanceBeforeBuildReservations = projectProfileMoneyBalance(
          wallet.balance,
          pendingProfileMoneyOperationsRef.current,
        )
        const currentProjection = projectCurrentProfileMoney()
        if (currentBalanceBeforeBuildReservations === null || !currentProjection) return null
        if (request.kind === 'weapon-purchase' && currentProjection.balance < request.cost)
          return null
        if (
          request.kind === 'zombie-kill-reward' &&
          currentBalanceBeforeBuildReservations > MAX_PROFILE_MONEY - ZOMBIE_ESCAPE_KILL_REWARD
        ) {
          return null
        }
      }
      const queueMetadata = {
        lastSentAt: null,
        lastSentConnectionId: null,
        operationId,
      }
      pendingProfileMoneyOperationsRef.current.push(
        request.kind === 'weapon-purchase'
          ? { ...queueMetadata, cost: request.cost, kind: request.kind }
          : { ...queueMetadata, kind: request.kind },
      )
      const projected = wallet ? (projectCurrentProfileMoney()?.balance ?? null) : null
      publishProfileMoney()
      flushProfileMoneyOperation()
      return projected
    },
    [
      flushProfileMoneyOperation,
      onlineEnabled,
      projectCurrentProfileMoney,
      publishProfileMoney,
      spectator,
      zombieGameClient,
    ],
  )

  const acceptProfileWallet = useCallback(
    (wallet: ProfileWalletSnapshot, fresh: boolean) => {
      if (wallet.profileId !== localProfile.id) return false
      const current = canonicalProfileWalletRef.current
      if (current && current.revision > wallet.revision) return false
      canonicalProfileWalletRef.current = wallet
      profileMoneyFreshRef.current = fresh
      publishProfileMoney()
      return true
    },
    [localProfile.id, publishProfileMoney],
  )

  const publishParcelBuildUpdates = useCallback(
    (updates: readonly Omit<ParcelBuildContentUpdate, 'sequence'>[]) => {
      if (updates.length === 0) return
      const authorityEpoch = parcelBuildContentAuthorityRef.current!.current
      const sequencedUpdates = updates.map((update) => ({
        ...update,
        sequence: ++parcelBuildUpdateSequenceRef.current,
      }))
      setParcelBuildUpdateMap((current) => {
        if (
          !isParcelBuildContentUpdateAuthorityCurrent(
            authorityEpoch,
            parcelBuildContentAuthorityRef.current!.current,
          )
        ) {
          return current
        }
        const next = new Map(current)
        for (const update of sequencedUpdates) {
          next.set(parcelBuildSyncKey(update.worldId, update.parcelId), {
            ...update,
          })
        }
        return next
      })
    },
    [],
  )

  const clearZombieEscapeStateObservation = useCallback(() => {
    zombieGameClient.clear()
    if (zombieEscapeStateObservationRef.current === null) return
    zombieEscapeStateObservationRef.current = null
    setZombieEscapeStateObservation(null)
    renderScheduler.requestFrame('animation')
  }, [zombieGameClient])

  const observeZombieEscapeState = useCallback(
    ({
      receivedAtMs,
      serverTime,
      state,
      transportGeneration,
    }: MultiplayerZombieEscapeStateObservation) => {
      const current = zombieEscapeStateObservationRef.current
      if (
        current?.transportGeneration === transportGeneration &&
        current.state.sessionId === state.sessionId &&
        current.state.revision > state.revision
      ) {
        return
      }
      const observation = { receivedAtMs, serverTime, state, transportGeneration }
      zombieEscapeStateObservationRef.current = observation
      setZombieEscapeStateObservation(observation)
      renderScheduler.requestFrame('animation')
    },
    [],
  )

  useLayoutEffect(() => {
    const current = transportScopeGenerationRef.current
    const next = advanceMultiplayerTransportScopeGeneration(transportScopeGenerationRef.current, {
      contentAuthority,
      gameMode,
      localProfileId: localProfile.id,
      parcelWorldId: watchedParcelWorldId,
      roomId,
      spectator,
    })
    transportScopeGenerationRef.current = next
    if (next !== current) clearZombieEscapeStateObservation()
  }, [
    clearZombieEscapeStateObservation,
    contentAuthority,
    gameMode,
    localProfile.id,
    roomId,
    spectator,
    watchedParcelWorldId,
  ])

  useLayoutEffect(() => {
    const transition = parcelBuildContentAuthorityRef.current!.updateScope({
      contentAuthority,
      localProfileId: localProfile.id,
      roomId,
    })
    if (!transition.changed) return

    parcelBuildSyncQueueRef.current!.clear()
    publishProfileMoney()
    parcelBuildUpdateSequenceRef.current = 0
    parcelOwnershipMapRef.current = new Map()
    parcelBuildNodeMapRef.current = new Map()
    tvMediaStateMapRef.current = new Map()
    setParcelBuildSnapshotWorldId(null)
    setParcelOwnershipMap(new Map())
    setParcelBuildNodeMap(new Map())
    setParcelBuildUpdateMap(new Map())
    setTvMediaStateMap(new Map())
    setParcelBuildContentAuthorityEpoch(transition.epoch)
  }, [contentAuthority, localProfile.id, publishProfileMoney, roomId])

  useLayoutEffect(() => {
    if (profileMoneyOwnerRef.current === localProfile.id) return
    profileMoneyOwnerRef.current = localProfile.id
    canonicalProfileWalletRef.current = null
    pendingProfileMoneyOperationsRef.current = []
    profileMoneyFreshRef.current = false
    setProfileMoney(null)
  }, [localProfile.id])

  const flushQueuedParcelBuildSync = useCallback(
    (worldId: string, parcelId: string) => {
      const connectionId = transportConnectionIdRef.current
      const writerSession = writerSessionRef.current
      if (
        !(
          onlineEnabled &&
          connectionId &&
          writerSession &&
          parcelBuildSyncQueueRef.current!.isWorldReady(worldId)
        )
      ) {
        return false
      }
      const now = Date.now()
      const message = parcelBuildSyncQueueRef.current!.prepareSend({
        connectionId,
        now,
        parcelId,
        retryAfterMs: PARCEL_BUILD_ACK_RETRY_MS,
        worldId,
        ...writerSession,
      })
      const transport = socketRef.current
      const transportGeneration = transportScopeGenerationRef.current.generation
      if (!message || !transport || !sendMessage(message, transport)) return false
      parcelBuildSyncQueueRef.current!.markSent(
        worldId,
        parcelId,
        message.operationId,
        connectionId,
        now,
      )
      window.setTimeout(() => {
        if (
          !isMultiplayerTransportSessionCallbackCurrent({
            capturedConnectionId: connectionId,
            capturedGeneration: transportGeneration,
            currentConnectionId: transportConnectionIdRef.current,
            currentGeneration: transportScopeGenerationRef.current.generation,
            currentTransport: socketRef.current,
            transport,
          })
        ) {
          return
        }
        flushQueuedParcelBuildSync(worldId, parcelId)
      }, PARCEL_BUILD_ACK_RETRY_MS)
      return true
    },
    [onlineEnabled, sendMessage],
  )

  const flushAllQueuedParcelBuildSyncs = useCallback(() => {
    const worldId = watchedParcelWorldIdRef.current
    if (!worldId) return
    for (const parcelId of parcelBuildSyncQueueRef.current!.parcelIds(worldId)) {
      flushQueuedParcelBuildSync(worldId, parcelId)
    }
  }, [flushQueuedParcelBuildSync])

  const sendPlayerState = useCallback(
    (player: MultiplayerPlayerSnapshot) => {
      latestPlayerRef.current = player
      if (!onlineEnabled || spectator) return

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
    [onlineEnabled, sendMessage, spectator],
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

  const startZombieEscapeNight = useCallback(() => {
    if (zombieGameClient.enabled && !zombieGameClient.ready()) return false
    const observation = zombieEscapeStateObservationRef.current
    if (
      !onlineEnabled ||
      spectator ||
      gameMode !== 'zombie-escape' ||
      !observation ||
      observation.transportGeneration !== transportScopeGenerationRef.current.generation ||
      observation.state.phase !== 'build' ||
      observation.state.phaseEndsAt !== null
    ) {
      return false
    }
    return Boolean(
      sendMessage({
        baseRevision: observation.state.revision,
        sessionId: observation.state.sessionId,
        type: 'start-zombie-escape-night',
      }),
    )
  }, [gameMode, onlineEnabled, sendMessage, spectator, zombieGameClient])

  const reportZombieEscapeDeath = useCallback(() => {
    if (zombieGameClient.enabled) return false
    const observation = zombieEscapeStateObservationRef.current
    if (
      !onlineEnabled ||
      spectator ||
      gameMode !== 'zombie-escape' ||
      !observation ||
      observation.transportGeneration !== transportScopeGenerationRef.current.generation ||
      observation.state.phase !== 'night' ||
      observation.state.night <= 0
    ) {
      return false
    }
    return Boolean(
      sendMessage({
        night: observation.state.night,
        sessionId: observation.state.sessionId,
        type: 'report-zombie-escape-death',
      }),
    )
  }, [gameMode, onlineEnabled, sendMessage, spectator, zombieGameClient])

  const watchParcelWorld = useCallback(
    (worldId: string) => {
      if (watchedParcelWorldIdRef.current === worldId) return

      const authorityTransition = parcelBuildContentAuthorityRef.current!.watchWorld(worldId)
      const currentTransportScope = transportScopeGenerationRef.current
      const nextTransportScope = advanceMultiplayerTransportScopeGeneration(currentTransportScope, {
        ...transportScopeGenerationRef.current.scope,
        parcelWorldId: worldId,
      })
      transportScopeGenerationRef.current = nextTransportScope
      if (nextTransportScope !== currentTransportScope) clearZombieEscapeStateObservation()
      watchedParcelWorldIdRef.current = worldId
      setWatchedParcelWorldId(worldId)
      parcelBuildSyncQueueRef.current!.clear()
      publishProfileMoney()
      parcelBuildUpdateSequenceRef.current = 0
      const offlineState =
        offlineAuthority && persistOfflineState ? readOfflineParcelWorldState(worldId) : null
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
      const localAuthority = resolveLocalParcelBuildContentAuthority({
        builds: [...nextBuildNodeMap.values()],
        contentAuthority,
        ownerships: [...nextOwnershipMap.values()],
        worldId,
      })
      setParcelBuildSnapshotWorldId(localAuthority.snapshotWorldId)
      setParcelOwnershipMap(nextOwnershipMap)
      setParcelBuildNodeMap(nextBuildNodeMap)
      setParcelBuildUpdateMap(new Map())
      setTvMediaStateMap(nextTvMediaStateMap)
      if (authorityTransition.changed) {
        setParcelBuildContentAuthorityEpoch(authorityTransition.epoch)
      }
      if (offlineAuthority) {
        publishParcelBuildUpdates(localAuthority.updates)
      }
    },
    [
      clearZombieEscapeStateObservation,
      contentAuthority,
      offlineAuthority,
      persistOfflineState,
      publishParcelBuildUpdates,
      publishProfileMoney,
    ],
  )

  const quoteParcelBuildNodes = useCallback(
    (worldId: string, parcelId: string, nodes: readonly ParcelBuildNode[]) => {
      if (offlineAuthority) {
        return resolveParcelBuildNodesQuote({
          authorityKnown: true,
          existingPendingBuildCost: 0,
          newPendingBuildCost: 0,
          pricingFailure: null,
          profileBalanceBeforeBuildReservations: null,
          profileMoneyFresh: false,
        })
      }
      const authorityKnown =
        onlineEnabled &&
        watchedParcelWorldIdRef.current === worldId &&
        parcelBuildSnapshotWorldId === worldId
      const existingPending = projectPendingParcelBuildCost()
      const newPending = authorityKnown
        ? projectPendingParcelBuildCost({ nodes, parcelId, worldId })
        : null
      const pricingFailure = !existingPending.ok
        ? existingPending.code
        : newPending && !newPending.ok
          ? newPending.code
          : null
      const wallet = canonicalProfileWalletRef.current
      const profileBalanceBeforeBuildReservations = wallet
        ? projectProfileMoneyBalance(wallet.balance, pendingProfileMoneyOperationsRef.current)
        : null
      return resolveParcelBuildNodesQuote({
        authorityKnown,
        existingPendingBuildCost: existingPending.ok ? existingPending.cost : null,
        newPendingBuildCost: newPending?.ok ? newPending.cost : null,
        pricingFailure,
        profileBalanceBeforeBuildReservations,
        profileMoneyFresh: profileMoneyFreshRef.current,
      })
    },
    [offlineAuthority, onlineEnabled, parcelBuildSnapshotWorldId, projectPendingParcelBuildCost],
  )

  const syncParcelBuildNodes = useCallback(
    (worldId: string, parcelId: string, nodes: readonly ParcelBuildNode[]) => {
      if (watchedParcelWorldIdRef.current !== worldId) watchParcelWorld(worldId)
      const clonedNodes = cloneParcelBuildNodes(nodes)
      if (offlineAuthority) {
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
      if (!onlineEnabled) return false
      const quote = quoteParcelBuildNodes(worldId, parcelId, clonedNodes)
      if (!quote.allowed) return false

      const currentBuild = parcelBuildNodeMapRef.current.get(parcelId)
      const pausedConflict = parcelBuildSyncQueueRef.current!.enqueue(
        worldId,
        parcelId,
        clonedNodes,
        currentBuild?.worldId === worldId ? currentBuild.revision : 0,
      )
      publishProfileMoney()
      if (pausedConflict) {
        publishParcelBuildUpdates([
          conflictContentUpdate(
            worldId,
            parcelId,
            pausedConflict.authoritativeBuild,
            pausedConflict,
          ),
        ])
        return false
      }
      flushQueuedParcelBuildSync(worldId, parcelId)
      return true
    },
    [
      flushQueuedParcelBuildSync,
      localProfile.id,
      offlineAuthority,
      onlineEnabled,
      persistOfflineState,
      publishParcelBuildUpdates,
      publishProfileMoney,
      quoteParcelBuildNodes,
      watchParcelWorld,
    ],
  )

  const resolveParcelBuildConflict = useCallback(
    (worldId: string, parcelId: string, nodes: readonly ParcelBuildNode[]) => {
      const quote = quoteParcelBuildNodes(worldId, parcelId, nodes)
      if (!quote.allowed) return false
      const currentBuild = parcelBuildNodeMapRef.current.get(parcelId)
      const resolved = parcelBuildSyncQueueRef.current!.resolveConflict(
        worldId,
        parcelId,
        nodes,
        currentBuild?.worldId === worldId ? currentBuild.revision : 0,
      )
      if (!resolved) return false
      setParcelBuildUpdateMap((current) => {
        const key = parcelBuildSyncKey(worldId, parcelId)
        if (current.get(key)?.source !== 'conflict') return current
        const next = new Map(current)
        next.delete(key)
        return next
      })
      publishProfileMoney()
      flushQueuedParcelBuildSync(worldId, parcelId)
      return true
    },
    [flushQueuedParcelBuildSync, publishProfileMoney, quoteParcelBuildNodes],
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
      if (watchedParcelWorldIdRef.current !== worldId) watchParcelWorld(worldId)
      if (!onlineEnabled && !offlineAuthority) return false
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

      if (offlineAuthority) {
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
    [
      localProfile.id,
      offlineAuthority,
      onlineEnabled,
      persistOfflineState,
      sendMessage,
      watchParcelWorld,
    ],
  )

  const claimParcel = useCallback(
    (worldId: string, parcelId: string) => {
      if (watchedParcelWorldIdRef.current !== worldId) watchParcelWorld(worldId)
      setParcelClaimError(null)
      if (offlineAuthority) {
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
        publishParcelBuildUpdates([
          createClaimedParcelBuildAuthorityUpdate({
            builds: [...parcelBuildNodeMapRef.current.values()],
            parcelId,
            worldId,
          }),
        ])
        return true
      }

      if (!onlineEnabled) {
        setParcelClaimError({
          code: 'not-connected',
          message: 'Connect before claiming a parcel',
          parcelId,
          worldId,
        })
        return false
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
    [
      localProfile,
      offlineAuthority,
      onlineEnabled,
      persistOfflineState,
      publishParcelBuildUpdates,
      sendMessage,
      watchParcelWorld,
    ],
  )

  useEffect(() => {
    const transportParcelWorldId = watchedParcelWorldId
    if (!onlineEnabled || (!spectator && localProfile.id === FALLBACK_LOCAL_PROFILE.id)) {
      clearZombieEscapeStateObservation()
      parcelBuildSyncQueueRef.current!.clear()
      parcelBuildUpdateSequenceRef.current = 0
      writerSessionRef.current = null
      writerLeaseEpochRef.current = null
      transportConnectionIdRef.current = null
      terminalWriterSessionRef.current = false
      profileMoneyFreshRef.current = false
      if (offlineAuthority) {
        canonicalProfileWalletRef.current = null
        pendingProfileMoneyOperationsRef.current = []
      }
      publishProfileMoney()
      setStatus(offlineAuthority ? 'offline' : 'connecting')
      remotePlayerMapRef.current = new Map()
      remotePlayerTimelineMapRef.current = new Map()
      setRemotePlayerRosterMap(new Map())
      setParcelClaimError(null)
      const offlineState =
        offlineAuthority && persistOfflineState
          ? readOfflineParcelWorldState(transportParcelWorldId)
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
      const localAuthority = transportParcelWorldId
        ? resolveLocalParcelBuildContentAuthority({
            builds: [...nextBuildNodeMap.values()],
            contentAuthority,
            ownerships: [...nextOwnershipMap.values()],
            worldId: transportParcelWorldId,
          })
        : { snapshotWorldId: null, updates: [] }
      setParcelBuildSnapshotWorldId(localAuthority.snapshotWorldId)
      setParcelBuildNodeMap(nextBuildNodeMap)
      setParcelBuildUpdateMap(new Map())
      setParcelOwnershipMap(nextOwnershipMap)
      setTvMediaStateMap(nextTvMediaStateMap)
      if (offlineAuthority && transportParcelWorldId) {
        publishParcelBuildUpdates(localAuthority.updates)
      }
      setConnection(createConnectionDetails())
      return
    }

    terminalWriterSessionRef.current = false
    writerSessionRef.current = null
    transportConnectionIdRef.current = null
    const transportGeneration = transportScopeGenerationRef.current.generation
    let cancelled = false
    let reconnectTimer = 0
    let heartbeatTimer = 0

    const clearHeartbeat = () => {
      window.clearInterval(heartbeatTimer)
      heartbeatTimer = 0
    }

    const connect = () => {
      if (cancelled || transportScopeGenerationRef.current.generation !== transportGeneration) {
        return
      }
      clearZombieEscapeStateObservation()
      profileMoneyFreshRef.current = false
      publishProfileMoney()
      setParcelBuildSnapshotWorldId(null)
      if (transportParcelWorldId) {
        parcelBuildSyncQueueRef.current!.suspendWorld(transportParcelWorldId)
      }
      setStatus(reconnectDelayRef.current > 1000 ? 'reconnecting' : 'connecting')
      setConnection((current) => ({
        ...current,
        connectionId: null,
        lastError: null,
        reconnectAttempt: reconnectAttemptRef.current,
      }))

      const socket = new WebSocket(
        resolveWorldMultiplayerWebSocketUrl({
          currentUrl: window.location.href,
          hostedUrl: HOSTED_MULTIPLAYER_WEBSOCKET_URL,
        }),
      )
      socketRef.current = socket
      const isCurrentSocket = () =>
        isMultiplayerTransportCallbackCurrent({
          capturedGeneration: transportGeneration,
          currentGeneration: transportScopeGenerationRef.current.generation,
          currentTransport: socketRef.current,
          transport: socket,
        })

      socket.addEventListener('open', () => {
        if (cancelled || !isCurrentSocket()) return
        reconnectDelayRef.current = 1000
        reconnectAttemptRef.current = 0
        const player = latestPlayerRef.current ?? createStationaryPlayer(localProfile)
        const joined = spectator
          ? sendMessage({ roomId, type: 'watch' }, socket)
          : sendMessage(
              {
                ...(gameMode ? { gameMode } : {}),
                ...(zombieGameClient.enabled ? { zombieGameSchemaVersion: 1 } : {}),
                player,
                roomId,
                type: 'join',
                writerEpoch: writerLeaseEpochRef.current ?? undefined,
                writerSessionId: writerSessionIdRef.current,
              },
              socket,
            )
        if (joined) {
          lastNetworkSentAtRef.current = window.performance.now()
          lastSentPlayerRef.current = player
        }
        if (transportParcelWorldId) {
          sendMessage({ roomId, type: 'watch-parcels', worldId: transportParcelWorldId }, socket)
        }
        clearHeartbeat()
        heartbeatTimer = window.setInterval(() => {
          if (!isCurrentSocket()) {
            clearHeartbeat()
            return
          }
          sendMessage({ sentAt: Date.now(), type: 'heartbeat' }, socket)
        }, heartbeatIntervalMsRef.current)
      })

      socket.addEventListener('message', (event) => {
        if (cancelled || !isCurrentSocket()) return
        const message = parseServerMessage(event.data)
        if (!message) return

        if (message.type === 'welcome') {
          if (zombieGameClient.enabled)
            zombieGameClient.acceptCapability(message.zombieGameAuthority?.schemaVersion)
          transportConnectionIdRef.current = message.connectionId
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

        if (message.type === 'zombie-game-status') {
          zombieGameClient.acceptStatus(message, transportGeneration)
          return
        }
        if (message.type === 'zombie-game-snapshot') {
          zombieGameClient.acceptSnapshot(message, transportGeneration)
          return
        }

        if (message.type === 'parcel-writer-session-granted') {
          if (
            spectator ||
            message.roomId !== roomId ||
            message.writerSessionId !== writerSessionIdRef.current
          ) {
            return
          }
          writerSessionRef.current = {
            writerEpoch: message.writerEpoch,
            writerSessionId: message.writerSessionId,
          }
          writerLeaseEpochRef.current = message.writerEpoch
          terminalWriterSessionRef.current = false
          if (
            watchedParcelWorldIdRef.current &&
            parcelBuildSyncQueueRef.current!.isWorldReady(watchedParcelWorldIdRef.current)
          ) {
            flushAllQueuedParcelBuildSyncs()
          }
          flushProfileMoneyOperation()
          return
        }

        if (message.type === 'parcel-writer-session-rejected') {
          if (message.writerSessionId !== writerSessionIdRef.current) return
          terminalWriterSessionRef.current = true
          writerSessionRef.current = null
          profileMoneyFreshRef.current = false
          publishProfileMoney()
          setConnection((current) => ({ ...current, lastError: message.message }))
          socket.close(PARCEL_WRITER_SESSION_CLOSE_CODE, 'Writer session superseded')
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

        if (message.type === 'profile-money-snapshot') {
          if (!acceptProfileWallet(message.wallet, true)) return
          const pending = pendingProfileMoneyOperationsRef.current[0]
          if (pending) {
            pending.lastSentAt = null
            pending.lastSentConnectionId = null
          }
          flushProfileMoneyOperation()
          return
        }

        if (message.type === 'profile-money-operation-ack') {
          const pending = pendingProfileMoneyOperationsRef.current[0]
          if (!pending || pending.operationId !== message.operationId) return
          pendingProfileMoneyOperationsRef.current.shift()
          if (!acceptProfileWallet(message.wallet, true)) publishProfileMoney()
          flushProfileMoneyOperation()
          return
        }

        if (message.type === 'profile-money-operation-rejected') {
          const pending = pendingProfileMoneyOperationsRef.current[0]
          if (!pending || pending.operationId !== message.operationId) return
          if (message.code === 'profile-money-conflict') {
            pending.lastSentAt = null
            pending.lastSentConnectionId = null
          } else {
            pendingProfileMoneyOperationsRef.current.shift()
            setConnection((current) => ({ ...current, lastError: message.message }))
          }
          if (!acceptProfileWallet(message.wallet, true)) publishProfileMoney()
          flushProfileMoneyOperation()
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

        if (
          message.type === 'zombie-escape-state-updated' ||
          message.type === 'zombie-escape-state-rejected'
        ) {
          if (message.roomId !== roomId || gameMode !== 'zombie-escape') return
          observeZombieEscapeState({
            receivedAtMs: performance.now(),
            serverTime: message.serverTime,
            state: message.state,
            transportGeneration,
          })
          if (message.type === 'zombie-escape-state-rejected') {
            setConnection((current) => ({ ...current, lastError: message.message }))
          }
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
          const nextOwnershipMap = new Map(
            message.ownerships.map((ownership) => [ownership.parcelId, ownership]),
          )
          parcelOwnershipMapRef.current = nextOwnershipMap
          setParcelOwnershipMap(nextOwnershipMap)
          setParcelClaimError(null)
          return
        }

        if (message.type === 'parcel-owned' || message.type === 'parcel-claim-result') {
          if (message.ownership.worldId !== watchedParcelWorldIdRef.current) return
          const nextOwnershipMap = new Map(parcelOwnershipMapRef.current)
          nextOwnershipMap.set(message.ownership.parcelId, message.ownership)
          parcelOwnershipMapRef.current = nextOwnershipMap
          setParcelOwnershipMap(nextOwnershipMap)
          setParcelClaimError(null)
          if (shouldRefreshParcelBuildAuthorityAfterClaim(message.type)) {
            sendMessage(
              {
                roomId,
                type: 'watch-parcels',
                worldId: message.ownership.worldId,
              },
              socket,
            )
          }
          return
        }

        if (message.type === 'parcel-build-nodes-snapshot') {
          if (message.worldId !== watchedParcelWorldIdRef.current) return
          const nextBuildNodeMap = new Map(message.builds.map((build) => [build.parcelId, build]))
          const parcelIds = new Set([
            ...parcelBuildNodeMapRef.current.keys(),
            ...nextBuildNodeMap.keys(),
            ...parcelBuildSyncQueueRef.current!.parcelIds(message.worldId),
            ...[...parcelOwnershipMapRef.current.values()]
              .filter((ownership) => ownership.worldId === message.worldId)
              .map((ownership) => ownership.parcelId),
          ])
          const updates: Omit<ParcelBuildContentUpdate, 'sequence'>[] = []
          let conflictReason: string | null = null
          for (const parcelId of parcelIds) {
            const build = nextBuildNodeMap.get(parcelId) ?? null
            const reconciliation = parcelBuildSyncQueueRef.current!.reconcileSnapshot(
              message.worldId,
              parcelId,
              build,
            )
            if (reconciliation.kind === 'content') {
              updates.push({ build, parcelId, source: 'snapshot', worldId: message.worldId })
            } else if (reconciliation.kind === 'conflict') {
              updates.push(
                conflictContentUpdate(message.worldId, parcelId, build, reconciliation.conflict),
              )
              conflictReason = `Parcel ${parcelId} changed while local work was pending`
            }
          }
          parcelBuildNodeMapRef.current = nextBuildNodeMap
          setParcelBuildNodeMap(nextBuildNodeMap)
          publishProfileMoney()
          publishParcelBuildUpdates(updates)
          setParcelBuildSnapshotWorldId(message.worldId)
          parcelBuildSyncQueueRef.current!.resumeWorld(message.worldId)
          if (conflictReason) {
            setConnection((current) => ({ ...current, lastError: conflictReason }))
          }
          flushAllQueuedParcelBuildSyncs()
          zombieGameClient.requestBind()
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

        if (message.type === 'parcel-build-nodes-ack') {
          if (
            message.worldId !== watchedParcelWorldIdRef.current ||
            message.writerSessionId !== writerSessionIdRef.current ||
            message.writerEpoch !== writerSessionRef.current?.writerEpoch
          ) {
            return
          }
          const acknowledged = parcelBuildSyncQueueRef.current!.acknowledge(
            message.worldId,
            message.parcelId,
            message.operationId,
            message.revision,
          )
          if (!acknowledged) return
          const acknowledgedBuild = {
            nodes: acknowledged.nodes,
            operationId: message.operationId,
            parcelId: message.parcelId,
            revision: acknowledged.revision,
            schemaVersion: PARCEL_BUILD_SCHEMA_VERSION,
            updatedAt: message.updatedAt,
            updatedBy: message.updatedBy,
            worldId: message.worldId,
          } satisfies ParcelBuildNodesSnapshot
          const nextBuildNodeMap = new Map(parcelBuildNodeMapRef.current)
          nextBuildNodeMap.set(message.parcelId, acknowledgedBuild)
          parcelBuildNodeMapRef.current = nextBuildNodeMap
          setParcelBuildNodeMap(nextBuildNodeMap)
          if (!message.wallet || !acceptProfileWallet(message.wallet, true)) publishProfileMoney()
          setConnection((current) =>
            current.lastError === null ? current : { ...current, lastError: null },
          )
          flushQueuedParcelBuildSync(message.worldId, message.parcelId)
          return
        }

        if (message.type === 'parcel-build-nodes-insufficient-funds') {
          if (message.worldId !== watchedParcelWorldIdRef.current) return
          const rejected = parcelBuildSyncQueueRef.current!.reject(
            message.worldId,
            message.parcelId,
            message.operationId,
            message.build,
          )
          if (!rejected) return
          parcelBuildSyncQueueRef.current!.clearWorld(message.worldId)
          parcelBuildSyncQueueRef.current!.resumeWorld(message.worldId)
          const nextBuildNodeMap = new Map(parcelBuildNodeMapRef.current)
          if (message.build) nextBuildNodeMap.set(message.parcelId, message.build)
          else nextBuildNodeMap.delete(message.parcelId)
          parcelBuildNodeMapRef.current = nextBuildNodeMap
          setParcelBuildNodeMap(nextBuildNodeMap)
          if (!acceptProfileWallet(message.wallet, true)) publishProfileMoney()
          publishParcelBuildUpdates([
            {
              build: message.build,
              parcelId: message.parcelId,
              rejectedOperationId: message.operationId,
              source: 'insufficient-funds',
              worldId: message.worldId,
            },
          ])
          setConnection((current) => ({ ...current, lastError: message.reason }))
          return
        }

        if (message.type === 'parcel-build-nodes-updated') {
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
          const reconciliation = parcelBuildSyncQueueRef.current!.reconcileRemoteBuild(
            message.build,
          )
          publishProfileMoney()
          if (reconciliation.kind === 'content') {
            publishParcelBuildUpdates([
              {
                build: message.build,
                parcelId: message.build.parcelId,
                source: 'remote',
                worldId: message.build.worldId,
              },
            ])
          } else if (reconciliation.kind === 'conflict') {
            publishParcelBuildUpdates([
              conflictContentUpdate(
                message.build.worldId,
                message.build.parcelId,
                message.build,
                reconciliation.conflict,
              ),
            ])
            setConnection((current) => ({
              ...current,
              lastError: `Parcel ${message.build.parcelId} changed while local work was pending`,
            }))
          } else {
            flushQueuedParcelBuildSync(message.build.worldId, message.build.parcelId)
          }
          return
        }

        if (message.type === 'parcel-build-nodes-conflict') {
          if (message.worldId !== watchedParcelWorldIdRef.current) return
          const conflict = parcelBuildSyncQueueRef.current!.reject(
            message.worldId,
            message.parcelId,
            message.operationId,
            message.build,
          )
          if (!conflict) return
          const nextBuildNodeMap = new Map(parcelBuildNodeMapRef.current)
          if (message.build) nextBuildNodeMap.set(message.build.parcelId, message.build)
          else nextBuildNodeMap.delete(message.parcelId)
          parcelBuildNodeMapRef.current = nextBuildNodeMap
          setParcelBuildNodeMap(nextBuildNodeMap)
          publishProfileMoney()
          publishParcelBuildUpdates([
            conflictContentUpdate(message.worldId, message.parcelId, message.build, conflict),
          ])
          setConnection((current) => ({ ...current, lastError: message.reason }))
          return
        }

        if (message.type === 'parcel-build-nodes-rejected') {
          if (message.worldId !== watchedParcelWorldIdRef.current) return
          const currentBuild = parcelBuildNodeMapRef.current.get(message.parcelId)
          const authoritativeBuild = currentBuild?.worldId === message.worldId ? currentBuild : null
          const conflict = parcelBuildSyncQueueRef.current!.reject(
            message.worldId,
            message.parcelId,
            message.operationId,
            authoritativeBuild,
          )
          if (!conflict) return
          publishProfileMoney()
          publishParcelBuildUpdates([
            conflictContentUpdate(message.worldId, message.parcelId, authoritativeBuild, conflict),
          ])
          setConnection((current) => ({ ...current, lastError: message.reason }))
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
          if (gameMode === 'zombie-escape') {
            if (message.zombieEscapeState) {
              observeZombieEscapeState({
                receivedAtMs: receivedAt,
                serverTime: message.serverTime,
                state: message.zombieEscapeState,
                transportGeneration,
              })
            } else {
              clearZombieEscapeStateObservation()
            }
          }
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
        const callbackIsCurrent = isCurrentSocket()
        if (socketRef.current !== socket) return
        clearHeartbeat()
        socketRef.current = null
        transportConnectionIdRef.current = null
        writerSessionRef.current = null
        profileMoneyFreshRef.current = false
        publishProfileMoney()
        if (cancelled || !callbackIsCurrent) return
        clearZombieEscapeStateObservation()

        if (terminalWriterSessionRef.current || event.code === PARCEL_WRITER_SESSION_CLOSE_CODE) {
          terminalWriterSessionRef.current = true
          setStatus('offline')
          setConnection((current) => ({
            ...current,
            connectionId: null,
            lastError: event.reason || current.lastError || 'Writer session superseded',
          }))
          return
        }

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
        if (cancelled || !isCurrentSocket()) return
        clearZombieEscapeStateObservation()
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
      clearZombieEscapeStateObservation()
    }
  }, [
    acceptProfileWallet,
    clearZombieEscapeStateObservation,
    contentAuthority,
    flushAllQueuedParcelBuildSyncs,
    flushProfileMoneyOperation,
    flushQueuedParcelBuildSync,
    gameMode,
    localProfile,
    observeZombieEscapeState,
    offlineAuthority,
    onlineEnabled,
    persistOfflineState,
    publishParcelBuildUpdates,
    publishProfileMoney,
    roomId,
    sendMessage,
    spectator,
    watchedParcelWorldId,
    zombieGameClient,
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
    applyProfileMoneyOperation,
    claimParcel,
    connection,
    parcelBuildNodes,
    parcelBuildContentAuthorityEpoch,
    parcelBuildUpdates,
    parcelBuildSnapshotWorldId,
    parcelClaimError,
    parcelOwnerships,
    publishLocalPlayer,
    profileMoney,
    quoteParcelBuildNodes,
    reportZombieEscapeDeath,
    remotePlayerStore,
    remotePlayers,
    resolveParcelBuildConflict,
    sendVoiceSignal,
    syncParcelBuildNodes,
    syncTvMediaState,
    status,
    startZombieEscapeNight,
    tvMediaStates,
    watchParcelWorld,
    zombieEscapeStateObservation,
    zombieGameClient,
  }
}

export function shouldSendPlayerSnapshot(
  player: MultiplayerPlayerSnapshot,
  previous: MultiplayerPlayerSnapshot | null,
  elapsedSinceLastSendMs: number,
) {
  if (!previous) return true
  if (elapsedSinceLastSendMs >= LOCAL_STATE_IDLE_SEND_INTERVAL_MS) return true
  if (player.name !== previous.name || player.color !== previous.color) return true
  if (player.moving !== previous.moving) return true
  if (player.pose !== previous.pose) return true
  if (combatSnapshotChanged(player.combat, previous.combat)) return true
  if (Math.abs(player.speed - previous.speed) >= LOCAL_STATE_SPEED_EPSILON) return true
  if (angleDistance(player.heading, previous.heading) >= LOCAL_STATE_HEADING_EPSILON) return true

  return (
    distanceSquared3(player.position, previous.position) >=
    LOCAL_STATE_POSITION_EPSILON * LOCAL_STATE_POSITION_EPSILON
  )
}

function combatSnapshotChanged(
  current: MultiplayerPlayerCombatSnapshot | undefined,
  previous: MultiplayerPlayerCombatSnapshot | undefined,
) {
  if (!current || !previous) return current !== previous
  if (
    current.weaponIndex !== previous.weaponIndex ||
    current.ammo !== previous.ammo ||
    current.shotSequence !== previous.shotSequence ||
    current.meleePhase !== previous.meleePhase ||
    Math.abs(current.meleeProgress - previous.meleeProgress) >= 0.02 ||
    angleDistance(current.aimAngle, previous.aimAngle) >= LOCAL_STATE_HEADING_EPSILON ||
    current.shots.length !== previous.shots.length
  ) {
    return true
  }
  return current.shots.some((shot, index) => {
    const oldShot = previous.shots[index]
    return (
      !oldShot ||
      shot.id !== oldShot.id ||
      shot.weaponIndex !== oldShot.weaponIndex ||
      shot.impactAge !== oldShot.impactAge ||
      distanceSquared3(shot.position, oldShot.position) > 0.000_001 ||
      distanceSquared3(shot.previousPosition, oldShot.previousPosition) > 0.000_001
    )
  })
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

function parseServerMessage(data: unknown): ServerMessage | null {
  try {
    const message = JSON.parse(String(data)) as ServerMessage
    if (isZombieGameSnapshot(message) || isZombieGameStatus(message)) return message
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
      typeof message.serverTime === 'number' &&
      (message.zombieEscapeState === undefined ||
        isMultiplayerZombieEscapeStateSnapshot(message.zombieEscapeState))
    ) {
      return message
    }
    if (
      (message?.type === 'zombie-escape-state-updated' ||
        message?.type === 'zombie-escape-state-rejected') &&
      typeof message.roomId === 'string' &&
      typeof message.serverTime === 'number' &&
      isMultiplayerZombieEscapeStateSnapshot(message.state) &&
      (message.type === 'zombie-escape-state-updated' ||
        (typeof message.code === 'string' && typeof message.message === 'string'))
    ) {
      return message
    }
    if (
      message?.type === 'profile-money-snapshot' &&
      typeof message.serverTime === 'number' &&
      isProfileWalletSnapshot(message.wallet)
    ) {
      return message
    }
    if (
      message?.type === 'profile-money-operation-ack' &&
      typeof message.operationId === 'string' &&
      typeof message.duplicate === 'boolean' &&
      typeof message.serverTime === 'number' &&
      isProfileWalletSnapshot(message.wallet)
    ) {
      return message
    }
    if (
      message?.type === 'profile-money-operation-rejected' &&
      typeof message.code === 'string' &&
      typeof message.message === 'string' &&
      typeof message.operationId === 'string' &&
      typeof message.serverTime === 'number' &&
      isProfileWalletSnapshot(message.wallet)
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
      message?.type === 'parcel-build-nodes-updated' &&
      typeof message.roomId === 'string' &&
      isParcelBuildNodesSnapshot(message.build)
    ) {
      return message
    }
    if (
      message?.type === 'parcel-build-nodes-ack' &&
      typeof message.operationId === 'string' &&
      typeof message.parcelId === 'string' &&
      Number.isSafeInteger(message.revision) &&
      typeof message.roomId === 'string' &&
      typeof message.serverTime === 'number' &&
      typeof message.updatedAt === 'number' &&
      typeof message.updatedBy === 'string' &&
      typeof message.worldId === 'string' &&
      (message.wallet === undefined || isProfileWalletSnapshot(message.wallet)) &&
      isParcelWriterEpoch(message.writerEpoch) &&
      typeof message.writerSessionId === 'string'
    ) {
      return message
    }
    if (
      message?.type === 'parcel-build-nodes-insufficient-funds' &&
      typeof message.operationId === 'string' &&
      typeof message.parcelId === 'string' &&
      typeof message.reason === 'string' &&
      typeof message.roomId === 'string' &&
      typeof message.serverTime === 'number' &&
      typeof message.worldId === 'string' &&
      Number.isSafeInteger(message.cost) &&
      message.cost >= 0 &&
      isProfileWalletSnapshot(message.wallet) &&
      (message.build === null || isParcelBuildNodesSnapshot(message.build))
    ) {
      return message
    }
    if (
      message?.type === 'parcel-build-nodes-conflict' &&
      typeof message.operationId === 'string' &&
      typeof message.parcelId === 'string' &&
      typeof message.reason === 'string' &&
      typeof message.roomId === 'string' &&
      typeof message.serverTime === 'number' &&
      typeof message.worldId === 'string' &&
      (message.build === null || isParcelBuildNodesSnapshot(message.build))
    ) {
      return message
    }
    if (
      message?.type === 'parcel-build-nodes-rejected' &&
      typeof message.code === 'string' &&
      typeof message.operationId === 'string' &&
      typeof message.parcelId === 'string' &&
      typeof message.reason === 'string' &&
      typeof message.roomId === 'string' &&
      typeof message.serverTime === 'number' &&
      typeof message.worldId === 'string'
    ) {
      return message
    }
    if (
      message?.type === 'parcel-writer-session-granted' &&
      typeof message.roomId === 'string' &&
      typeof message.serverTime === 'number' &&
      isParcelWriterEpoch(message.writerEpoch) &&
      typeof message.writerSessionId === 'string'
    ) {
      return message
    }
    if (
      message?.type === 'parcel-writer-session-rejected' &&
      typeof message.code === 'string' &&
      typeof message.message === 'string' &&
      typeof message.serverTime === 'number' &&
      typeof message.writerSessionId === 'string'
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
    isSupportedParcelBuildSchemaVersion(build.schemaVersion) &&
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
    schemaVersion: isSupportedParcelBuildSchemaVersion(build.schemaVersion)
      ? build.schemaVersion
      : LEGACY_PARCEL_BUILD_SCHEMA_VERSION,
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
    (player.combat === undefined || isMultiplayerPlayerCombatSnapshot(player.combat)) &&
    (player.pose === undefined || isMultiplayerPlayerPose(player.pose)) &&
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

function createProfileMoneyOperationId() {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? `money-${globalThis.crypto.randomUUID()}`
    : `money-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function projectProfileMoneyBalance(
  canonicalBalance: number,
  operations: readonly ProfileMoneyOperationRequest[],
) {
  if (
    !Number.isSafeInteger(canonicalBalance) ||
    canonicalBalance < 0 ||
    canonicalBalance > MAX_PROFILE_MONEY
  ) {
    return null
  }
  let projectedBalance = canonicalBalance
  for (const operation of operations) {
    if (operation.kind === 'zombie-kill-reward') {
      if (projectedBalance > MAX_PROFILE_MONEY - ZOMBIE_ESCAPE_KILL_REWARD) return null
      projectedBalance += ZOMBIE_ESCAPE_KILL_REWARD
      continue
    }
    if (
      !Number.isSafeInteger(operation.cost) ||
      operation.cost <= 0 ||
      projectedBalance < operation.cost
    ) {
      return null
    }
    projectedBalance -= operation.cost
  }
  return projectedBalance
}

export function projectProfileMoneyBalanceAfterBuildReservations(
  canonicalBalance: number,
  operations: readonly ProfileMoneyOperationRequest[],
  pendingBuildCost: number,
) {
  if (!isPendingBuildCost(pendingBuildCost)) return null
  const balanceBeforeBuildReservations = projectProfileMoneyBalance(canonicalBalance, operations)
  if (
    balanceBeforeBuildReservations === null ||
    balanceBeforeBuildReservations < pendingBuildCost
  ) {
    return null
  }
  return balanceBeforeBuildReservations - pendingBuildCost
}

function createParcelWriterSessionId() {
  const candidate =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? `writer-${globalThis.crypto.randomUUID()}`
      : `writer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return sanitizeParcelWriterSessionId(candidate)
}

function conflictContentUpdate(
  worldId: string,
  parcelId: string,
  build: ParcelBuildNodesSnapshot | null,
  conflict: ParcelBuildSyncConflict,
): Omit<ParcelBuildContentUpdate, 'sequence'> {
  return {
    build,
    localDesiredNodes: cloneParcelBuildNodes(conflict.localDesiredNodes),
    parcelId,
    rejectedOperationId: conflict.rejectedOperationId,
    source: 'conflict',
    worldId,
  }
}

function parcelBuildSyncKey(worldId: string, parcelId: string) {
  return `${worldId}:${parcelId}`
}
