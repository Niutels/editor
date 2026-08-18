import {
  experimental_upgradeWebSocket,
  type WebSocket,
  type WebSocketData,
} from '@vercel/functions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type PlayerSnapshot = {
  color: string
  heading: number
  id: string
  moving: boolean
  name: string
  pose?: 'falling'
  position: [number, number, number]
  speed: number
  updatedAt: number
}

type ParcelOwnership = {
  claimedAt: number
  owner: Pick<PlayerSnapshot, 'color' | 'id' | 'name'>
  parcelId: string
  worldId: string
}

type BuildNodeSnapshot = Record<string, unknown> & {
  id: string
  parentId?: string | null
  type: string
}

type ParcelBuildNodesSnapshot = {
  nodes: BuildNodeSnapshot[]
  parcelId: string
  updatedAt: number
  updatedBy: string
  worldId: string
}

type TvMediaStateSnapshot = {
  muted: boolean
  parcelId: string
  playbackSeconds: number
  playbackUpdatedAt: number
  playing: boolean
  tvId: string
  updatedAt: number
  updatedBy: string
  url: string
  userVolume: number
  worldId: string
}

type VoiceSignalPayload =
  | { description: { sdp: string; type: 'answer' | 'offer' }; type: 'description' }
  | { candidate: Record<string, unknown>; type: 'ice-candidate' }
  | { type: 'disconnect' }
  | { type: 'ready' }

type ClientMessage =
  | { parcelId: string; type: 'claim-parcel'; worldId: string }
  | { player: PlayerSnapshot; roomId?: string; type: 'join' }
  | { player: PlayerSnapshot; type: 'state' }
  | { sentAt?: number; type: 'heartbeat' }
  | { signal: VoiceSignalPayload; to: string; type: 'voice-signal' }
  | {
      nodes: unknown[]
      parcelId: string
      type: 'sync-parcel-build-nodes'
      worldId: string
    }
  | {
      muted?: boolean
      parcelId: string
      playbackSeconds?: number
      playing?: boolean
      tvId: string
      type: 'sync-tv-media-state'
      url: string
      userVolume?: number
      worldId: string
    }
  | { type: 'leave' }
  | { roomId?: string; type: 'watch' }
  | { roomId?: string; type: 'watch-parcels'; worldId: string }

type ServerMessage =
  | {
      connectionId: string
      heartbeatIntervalMs: number
      maxPeers: number
      serverTime: number
      stalePeerMs: number
      type: 'welcome'
    }
  | { players: PlayerSnapshot[]; roomId: string; serverTime: number; type: 'snapshot' }
  | { player: PlayerSnapshot; roomId: string; serverTime: number; type: 'player-joined' }
  | { player: PlayerSnapshot; roomId: string; serverTime: number; type: 'player-state' }
  | { id: string; reason?: string; roomId: string; serverTime: number; type: 'player-left' }
  | {
      from: string
      roomId: string
      serverTime: number
      signal: VoiceSignalPayload
      type: 'voice-signal'
    }
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

type Peer = {
  connectionId: string
  id: string
  joinedAt: number
  lastSeenAt: number
  lastStateAt: number
  player: PlayerSnapshot
  roomId: string
  socket: WebSocket
}

type Watcher = {
  connectionId: string
  lastSeenAt: number
  roomId: string
  socket: WebSocket
}

type Room = {
  peers: Map<string, Peer>
  watchers: Set<Watcher>
}

const DEFAULT_ROOM_ID = 'landrush-lab-world-multiplayer'
const HEARTBEAT_INTERVAL_MS = 3000
const LANDRUSH_BUILD_NODE_TYPES = new Set([
  'box-vent',
  'ceiling',
  'chimney',
  'column',
  'door',
  'dormer',
  'elevator',
  'fence',
  'item',
  'level',
  'ridge-vent',
  'roof',
  'roof-segment',
  'shelf',
  'slab',
  'skylight',
  'solar-panel',
  'stair',
  'stair-segment',
  'wall',
  'window',
])
const MAX_BUILD_NODES_PER_PARCEL = 1000
const MAX_BUILD_SNAPSHOT_BYTES = 1_250_000
const MAX_ROOM_ID_LENGTH = 80
const MAX_ROOM_PEERS = 32
const MIN_STATE_INTERVAL_MS = 40
const PEER_STALE_MS = 15_000

// Instance-local room state. On scaled Vercel deployments, durable room state/pubsub belongs in
// an external store because reconnects may land on another function instance.
const rooms = new Map<string, Room>()
const parcelBuildNodesByWorld = new Map<string, Map<string, ParcelBuildNodesSnapshot>>()
const parcelOwnershipByWorld = new Map<string, Map<string, ParcelOwnership>>()
const tvMediaStateByWorld = new Map<string, Map<string, TvMediaStateSnapshot>>()

export async function GET(request: Request) {
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('WebSocket upgrade required', { status: 426 })
  }

  return experimental_upgradeWebSocket((socket) => {
    const connectionId = crypto.randomUUID()
    let peer: Peer | null = null
    let watcher: Watcher | null = null

    send(socket, {
      connectionId,
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      maxPeers: MAX_ROOM_PEERS,
      serverTime: Date.now(),
      stalePeerMs: PEER_STALE_MS,
      type: 'welcome',
    })

    socket.on('message', (data: WebSocketData) => {
      const now = Date.now()
      sweepStalePeers(now)

      const message = parseClientMessage(data)
      if (!message) {
        sendError(socket, 'bad-message', 'Ignored malformed multiplayer message')
        return
      }

      if (message.type === 'join') {
        const player = sanitizePlayerSnapshot(message.player, now)
        const roomId = sanitizeRoomId(message.roomId)
        const room = getRoom(roomId)
        const existingPeer = room.peers.get(player.id)

        if (!existingPeer && room.peers.size >= MAX_ROOM_PEERS) {
          sendError(socket, 'room-full', 'Room is full')
          socket.close(1013, 'Room is full')
          return
        }

        leaveWatcher(watcher)
        watcher = null
        leaveRoom(peer, false, 'room-change')
        peer = {
          connectionId,
          id: player.id,
          joinedAt: now,
          lastSeenAt: now,
          lastStateAt: 0,
          player,
          roomId,
          socket,
        }
        joinRoom(peer)
        return
      }

      if (message.type === 'watch') {
        const roomId = sanitizeRoomId(message.roomId)
        leaveRoom(peer, true, 'watching')
        peer = null
        leaveWatcher(watcher)
        watcher = {
          connectionId,
          lastSeenAt: now,
          roomId,
          socket,
        }
        watchRoom(watcher)
        return
      }

      if (message.type === 'watch-parcels') {
        if (peer) peer.lastSeenAt = now
        if (watcher) watcher.lastSeenAt = now
        const worldId = sanitizeParcelWorldId(message.worldId)
        const roomId = sanitizeRoomId(message.roomId ?? peer?.roomId ?? watcher?.roomId)
        sendParcelOwnershipSnapshot(socket, roomId, worldId)
        sendParcelBuildNodesSnapshot(socket, roomId, worldId)
        sendTvMediaStateSnapshot(socket, roomId, worldId)
        return
      }

      if (message.type === 'sync-parcel-build-nodes') {
        if (!peer) {
          sendError(socket, 'not-joined', 'Join a room before syncing parcel build nodes')
          return
        }

        peer.lastSeenAt = now
        const synced = syncParcelBuildNodes(
          peer,
          message.worldId,
          message.parcelId,
          message.nodes,
          now,
        )
        if (!synced.ok) {
          sendError(socket, synced.code, synced.message)
          return
        }

        send(socket, {
          build: synced.build,
          roomId: peer.roomId,
          serverTime: now,
          type: 'parcel-build-nodes-synced',
        })
        broadcast(
          peer.roomId,
          {
            build: synced.build,
            roomId: peer.roomId,
            serverTime: now,
            type: 'parcel-build-nodes-updated',
          },
          peer.id,
        )
        return
      }

      if (message.type === 'sync-tv-media-state') {
        if (!peer) {
          sendError(socket, 'not-joined', 'Join a room before syncing TV media')
          return
        }

        peer.lastSeenAt = now
        const synced = syncTvMediaState(peer, message, now)
        if (!synced.ok) {
          sendError(socket, synced.code, synced.message)
          return
        }

        send(socket, {
          roomId: peer.roomId,
          serverTime: now,
          tv: synced.tv,
          type: 'tv-media-state-synced',
        })
        broadcast(
          peer.roomId,
          {
            roomId: peer.roomId,
            serverTime: now,
            tv: synced.tv,
            type: 'tv-media-state-updated',
          },
          peer.id,
        )
        return
      }

      if (message.type === 'claim-parcel') {
        if (!peer) {
          sendParcelClaimRejected(socket, {
            code: 'not-joined',
            message: 'Join a room before claiming a parcel',
            parcelId: sanitizeParcelId(message.parcelId),
            roomId: watcher?.roomId,
            worldId: sanitizeParcelWorldId(message.worldId),
          })
          return
        }

        peer.lastSeenAt = now
        const claim = claimParcel(peer, message.worldId, message.parcelId, now)
        if (!claim.ok) {
          sendParcelClaimRejected(socket, claim)
          return
        }

        send(socket, {
          ownership: claim.ownership,
          roomId: peer.roomId,
          serverTime: now,
          type: 'parcel-claim-result',
        })
        broadcast(
          peer.roomId,
          {
            ownership: claim.ownership,
            roomId: peer.roomId,
            serverTime: now,
            type: 'parcel-owned',
          },
          peer.id,
        )
        return
      }

      if (message.type === 'state') {
        if (!peer) {
          sendError(socket, 'not-joined', 'Join a room before sending player state')
          return
        }

        if (now - peer.lastStateAt < MIN_STATE_INTERVAL_MS) return

        peer.lastSeenAt = now
        peer.lastStateAt = now
        peer.player = sanitizePlayerSnapshot({ ...message.player, id: peer.id }, now)
        broadcast(
          peer.roomId,
          { player: peer.player, roomId: peer.roomId, serverTime: now, type: 'player-state' },
          peer.id,
        )
        return
      }

      if (message.type === 'voice-signal') {
        if (!peer) {
          sendError(socket, 'not-joined', 'Join a room before sending voice signals')
          return
        }

        peer.lastSeenAt = now
        forwardVoiceSignal(peer, message.to, message.signal, now)
        return
      }

      if (message.type === 'heartbeat') {
        if (peer) peer.lastSeenAt = now
        if (watcher) watcher.lastSeenAt = now
        const roomId = peer?.roomId ?? watcher?.roomId
        const room = roomId ? rooms.get(roomId) : undefined
        send(socket, {
          playerCount: room ? room.peers.size : undefined,
          roomId,
          sentAt: finiteNumber(message.sentAt, undefined),
          serverTime: now,
          type: 'heartbeat',
        })
        return
      }

      leaveRoom(peer, true, 'left')
      peer = null
      leaveWatcher(watcher)
      watcher = null
    })

    socket.on('close', () => {
      leaveRoom(peer, true, 'closed')
      peer = null
      leaveWatcher(watcher)
      watcher = null
    })

    socket.on('error', () => {
      leaveRoom(peer, true, 'error')
      peer = null
      leaveWatcher(watcher)
      watcher = null
    })
  })
}

function joinRoom(peer: Peer) {
  const room = getRoom(peer.roomId)
  const previousPeer = room.peers.get(peer.id)
  if (previousPeer && previousPeer.socket !== peer.socket) {
    previousPeer.socket.close(1000, 'Replaced by a newer connection')
  }

  room.peers.set(peer.id, peer)
  const now = Date.now()

  send(peer.socket, {
    players: roomSnapshots(room, peer.id),
    roomId: peer.roomId,
    serverTime: now,
    type: 'snapshot',
  })
  broadcast(
    peer.roomId,
    { player: peer.player, roomId: peer.roomId, serverTime: now, type: 'player-joined' },
    peer.id,
  )
  broadcastRoomState(peer.roomId)
}

function watchRoom(watcher: Watcher) {
  const room = getRoom(watcher.roomId)
  room.watchers.add(watcher)
  const now = Date.now()

  send(watcher.socket, {
    players: roomSnapshots(room),
    roomId: watcher.roomId,
    serverTime: now,
    type: 'snapshot',
  })
  send(watcher.socket, {
    playerCount: room.peers.size,
    roomId: watcher.roomId,
    serverTime: now,
    type: 'room-state',
  })
}

function leaveRoom(peer: Peer | null, announce: boolean, reason?: string) {
  if (!peer) return

  const room = rooms.get(peer.roomId)
  if (!room || room.peers.get(peer.id) !== peer) return

  room.peers.delete(peer.id)
  const now = Date.now()
  if (roomIsEmpty(room)) {
    rooms.delete(peer.roomId)
    return
  }

  if (announce) {
    broadcast(peer.roomId, {
      id: peer.id,
      reason,
      roomId: peer.roomId,
      serverTime: now,
      type: 'player-left',
    })
  }
  broadcastRoomState(peer.roomId)
}

function leaveWatcher(watcher: Watcher | null) {
  if (!watcher) return
  const room = rooms.get(watcher.roomId)
  if (!room) return
  room.watchers.delete(watcher)
  if (roomIsEmpty(room)) rooms.delete(watcher.roomId)
}

function sweepStalePeers(now: number) {
  for (const room of rooms.values()) {
    for (const peer of room.peers.values()) {
      if (now - peer.lastSeenAt <= PEER_STALE_MS) continue
      peer.socket.close(1001, 'Stale peer')
      leaveRoom(peer, true, 'stale')
    }
    for (const watcher of room.watchers) {
      if (now - watcher.lastSeenAt <= PEER_STALE_MS) continue
      watcher.socket.close(1001, 'Stale watcher')
      leaveWatcher(watcher)
    }
  }
}

function broadcastRoomState(roomId: string) {
  const room = rooms.get(roomId)
  if (!room) return

  broadcast(roomId, {
    playerCount: room.peers.size,
    roomId,
    serverTime: Date.now(),
    type: 'room-state',
  })
}

function forwardVoiceSignal(
  peer: Peer,
  targetPeerIdValue: string,
  signal: VoiceSignalPayload,
  now: number,
) {
  const targetPeerId = sanitizeText(targetPeerIdValue, '', 80)
  if (!targetPeerId || targetPeerId === peer.id) return

  const target = rooms.get(peer.roomId)?.peers.get(targetPeerId)
  if (!target) return

  send(target.socket, {
    from: peer.id,
    roomId: peer.roomId,
    serverTime: now,
    signal,
    type: 'voice-signal',
  })
}

function claimParcel(
  peer: Peer,
  worldIdValue: string,
  parcelIdValue: string,
  now: number,
):
  | { ok: true; ownership: ParcelOwnership }
  | {
      code: string
      message: string
      ok: false
      parcelId: string
      roomId: string
      worldId: string
    } {
  const worldId = sanitizeParcelWorldId(worldIdValue)
  const parcelId = sanitizeParcelId(parcelIdValue)
  const ownerships = getParcelOwnerships(worldId)
  const existingOwner = ownerships.get(parcelId)

  if (existingOwner) {
    return {
      code: 'already-owned',
      message: `${parcelId} is already claimed`,
      ok: false,
      parcelId,
      roomId: peer.roomId,
      worldId,
    }
  }

  const existingParcel = [...ownerships.values()].find(
    (ownership) => ownership.owner.id === peer.id,
  )
  if (existingParcel) {
    return {
      code: 'claim-limit',
      message: 'You already claimed a parcel in this world',
      ok: false,
      parcelId: existingParcel.parcelId,
      roomId: peer.roomId,
      worldId,
    }
  }

  const ownership: ParcelOwnership = {
    claimedAt: now,
    owner: {
      color: peer.player.color,
      id: peer.id,
      name: peer.player.name,
    },
    parcelId,
    worldId,
  }
  ownerships.set(parcelId, ownership)
  return { ok: true, ownership }
}

function sendParcelOwnershipSnapshot(socket: WebSocket, roomId: string, worldId: string) {
  send(socket, {
    ownerships: parcelOwnershipSnapshot(worldId),
    roomId,
    serverTime: Date.now(),
    type: 'parcel-ownership-snapshot',
    worldId,
  })
}

function sendParcelBuildNodesSnapshot(socket: WebSocket, roomId: string, worldId: string) {
  send(socket, {
    builds: parcelBuildNodesSnapshot(worldId),
    roomId,
    serverTime: Date.now(),
    type: 'parcel-build-nodes-snapshot',
    worldId,
  })
}

function sendTvMediaStateSnapshot(socket: WebSocket, roomId: string, worldId: string) {
  send(socket, {
    roomId,
    serverTime: Date.now(),
    tvs: tvMediaStateSnapshot(worldId),
    type: 'tv-media-state-snapshot',
    worldId,
  })
}

function syncParcelBuildNodes(
  peer: Peer,
  worldIdValue: string,
  parcelIdValue: string,
  nodesValue: unknown[],
  now: number,
): { build: ParcelBuildNodesSnapshot; ok: true } | { code: string; message: string; ok: false } {
  const worldId = sanitizeParcelWorldId(worldIdValue)
  const parcelId = sanitizeParcelId(parcelIdValue)
  const ownership = getParcelOwnerships(worldId).get(parcelId)
  if (!ownership || ownership.owner.id !== peer.id) {
    return {
      code: 'parcel-build-not-owned',
      message: 'Only the parcel owner can sync build nodes',
      ok: false,
    }
  }

  const nodes = sanitizeBuildNodes(nodesValue)
  if (!nodes.ok) return nodes

  const build = {
    nodes: nodes.nodes,
    parcelId,
    updatedAt: now,
    updatedBy: peer.id,
    worldId,
  }
  getParcelBuildNodes(worldId).set(parcelId, build)
  return { build, ok: true }
}

function syncTvMediaState(
  peer: Peer,
  message: Extract<ClientMessage, { type: 'sync-tv-media-state' }>,
  now: number,
): { ok: true; tv: TvMediaStateSnapshot } | { code: string; message: string; ok: false } {
  const worldId = sanitizeParcelWorldId(message.worldId)
  const parcelId = sanitizeParcelId(message.parcelId)
  const ownership = getParcelOwnerships(worldId).get(parcelId)
  if (!ownership || ownership.owner.id !== peer.id) {
    return {
      code: 'tv-media-not-owned',
      message: 'Only the parcel owner can sync TV media',
      ok: false,
    }
  }

  const url = sanitizeText(message.url, '', 2048)
  const tv = {
    muted: Boolean(message.muted),
    parcelId,
    playbackSeconds: Math.max(0, finiteNumber(message.playbackSeconds, 0)),
    playbackUpdatedAt: now,
    playing: typeof message.playing === 'boolean' ? message.playing : Boolean(url),
    tvId: sanitizeParcelKey(message.tvId, 'tv', 120),
    updatedAt: now,
    updatedBy: peer.id,
    url,
    userVolume: clamp01(finiteNumber(message.userVolume, 0.8)),
    worldId,
  }
  getTvMediaStates(worldId).set(tv.tvId, tv)
  return { ok: true, tv }
}

function sendParcelClaimRejected(
  socket: WebSocket,
  rejection: {
    code: string
    message: string
    parcelId?: string
    roomId?: string
    worldId?: string
  },
) {
  send(socket, {
    code: rejection.code,
    message: rejection.message,
    parcelId: rejection.parcelId,
    roomId: rejection.roomId,
    serverTime: Date.now(),
    type: 'parcel-claim-rejected',
    worldId: rejection.worldId,
  })
}

function getParcelOwnerships(worldId: string) {
  let ownerships = parcelOwnershipByWorld.get(worldId)
  if (!ownerships) {
    ownerships = new Map()
    parcelOwnershipByWorld.set(worldId, ownerships)
  }
  return ownerships
}

function getParcelBuildNodes(worldId: string) {
  let builds = parcelBuildNodesByWorld.get(worldId)
  if (!builds) {
    builds = new Map()
    parcelBuildNodesByWorld.set(worldId, builds)
  }
  return builds
}

function getTvMediaStates(worldId: string) {
  let tvs = tvMediaStateByWorld.get(worldId)
  if (!tvs) {
    tvs = new Map()
    tvMediaStateByWorld.set(worldId, tvs)
  }
  return tvs
}

function parcelOwnershipSnapshot(worldId: string) {
  return [...(parcelOwnershipByWorld.get(worldId)?.values() ?? [])].sort((first, second) =>
    first.parcelId.localeCompare(second.parcelId),
  )
}

function parcelBuildNodesSnapshot(worldId: string) {
  return [...(parcelBuildNodesByWorld.get(worldId)?.values() ?? [])].sort((first, second) =>
    first.parcelId.localeCompare(second.parcelId),
  )
}

function tvMediaStateSnapshot(worldId: string) {
  return [...(tvMediaStateByWorld.get(worldId)?.values() ?? [])].sort((first, second) =>
    first.tvId.localeCompare(second.tvId),
  )
}

function broadcast(roomId: string, message: ServerMessage, exceptPeerId?: string) {
  const room = rooms.get(roomId)
  if (!room) return

  for (const roomPeer of room.peers.values()) {
    if (roomPeer.id === exceptPeerId) continue
    send(roomPeer.socket, message)
  }
  for (const watcher of room.watchers) {
    send(watcher.socket, message)
  }
}

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState !== 1) return false

  try {
    socket.send(JSON.stringify(message))
    return true
  } catch {
    socket.close(1011, 'Failed to send multiplayer message')
    return false
  }
}

function sendError(socket: WebSocket, code: string, message: string) {
  send(socket, { code, message, serverTime: Date.now(), type: 'error' })
}

function getRoom(roomId: string) {
  let room = rooms.get(roomId)
  if (!room) {
    room = { peers: new Map(), watchers: new Set() }
    rooms.set(roomId, room)
  }
  return room
}

function roomSnapshots(room: Room, exceptPeerId?: string) {
  return [...room.peers.values()]
    .filter((roomPeer) => roomPeer.id !== exceptPeerId)
    .map((roomPeer) => roomPeer.player)
    .sort((first, second) => first.name.localeCompare(second.name))
}

function roomIsEmpty(room: Room) {
  return room.peers.size === 0 && room.watchers.size === 0
}

function parseClientMessage(data: WebSocketData): ClientMessage | null {
  try {
    const raw = JSON.parse(data.toString()) as ClientMessage
    if (raw?.type === 'join' && isPlayerSnapshot(raw.player)) return raw
    if (raw?.type === 'state' && isPlayerSnapshot(raw.player)) return raw
    if (raw?.type === 'heartbeat') return raw
    if (raw?.type === 'leave') return raw
    if (raw?.type === 'watch') return raw
    if (raw?.type === 'watch-parcels' && typeof raw.worldId === 'string') return raw
    if (
      raw?.type === 'voice-signal' &&
      typeof raw.to === 'string' &&
      isVoiceSignalPayload(raw.signal)
    ) {
      return raw
    }
    if (
      raw?.type === 'sync-parcel-build-nodes' &&
      typeof raw.worldId === 'string' &&
      typeof raw.parcelId === 'string' &&
      Array.isArray(raw.nodes)
    ) {
      return raw
    }
    if (
      raw?.type === 'sync-tv-media-state' &&
      typeof raw.worldId === 'string' &&
      typeof raw.parcelId === 'string' &&
      typeof raw.tvId === 'string' &&
      typeof raw.url === 'string'
    ) {
      return raw
    }
    if (
      raw?.type === 'claim-parcel' &&
      typeof raw.worldId === 'string' &&
      typeof raw.parcelId === 'string'
    ) {
      return raw
    }
  } catch {
    return null
  }
  return null
}

function isPlayerSnapshot(value: unknown): value is PlayerSnapshot {
  const player = value as PlayerSnapshot
  return (
    typeof player?.id === 'string' &&
    typeof player.name === 'string' &&
    typeof player.color === 'string' &&
    Array.isArray(player.position) &&
    player.position.length === 3
  )
}

function isVoiceSignalPayload(value: unknown): value is VoiceSignalPayload {
  const signal = value as VoiceSignalPayload
  if (signal?.type === 'disconnect') return true
  if (signal?.type === 'ready') return true
  if (signal?.type === 'ice-candidate') return typeof signal.candidate === 'object'
  return (
    signal?.type === 'description' &&
    (signal.description?.type === 'offer' || signal.description?.type === 'answer') &&
    typeof signal.description.sdp === 'string' &&
    signal.description.sdp.length <= 120_000
  )
}

function sanitizeRoomId(roomId: string | undefined) {
  const normalized = roomId?.trim()
  if (!normalized) return DEFAULT_ROOM_ID
  return normalized.slice(0, MAX_ROOM_ID_LENGTH).replace(/[^a-zA-Z0-9_-]/g, '-')
}

function sanitizePlayerSnapshot(player: PlayerSnapshot, now: number): PlayerSnapshot {
  return {
    color: sanitizeColor(player.color),
    heading: finiteNumber(player.heading, 0),
    id: sanitizeText(player.id, crypto.randomUUID(), 80),
    moving: Boolean(player.moving),
    name: sanitizeText(player.name, 'Player', 32),
    ...(player.pose === 'falling' ? { pose: 'falling' as const } : {}),
    position: [
      finiteNumber(player.position?.[0], 0),
      finiteNumber(player.position?.[1], 0),
      finiteNumber(player.position?.[2], 0),
    ],
    speed: Math.max(0, finiteNumber(player.speed, 0)),
    updatedAt: now,
  }
}

function sanitizeText(value: string | undefined, fallback: string, maxLength: number) {
  const text = typeof value === 'string' ? value.trim() : ''
  return (text || fallback).slice(0, maxLength)
}

function sanitizeColor(value: string | undefined) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#7dd3fc'
}

function sanitizeParcelWorldId(value: string | undefined) {
  return sanitizeParcelKey(value, 'landrush-world', 240)
}

function sanitizeParcelId(value: string | undefined) {
  return sanitizeParcelKey(value, 'parcel', 80)
}

function sanitizeParcelKey(value: string | undefined, fallback: string, maxLength: number) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return (normalized || fallback).slice(0, maxLength).replace(/[^a-zA-Z0-9._:-]/g, '-')
}

function sanitizeBuildNodes(
  value: unknown[],
): { nodes: BuildNodeSnapshot[]; ok: true } | { code: string; message: string; ok: false } {
  if (!Array.isArray(value)) {
    return { code: 'bad-build-nodes', message: 'Build nodes must be an array', ok: false }
  }
  if (value.length > MAX_BUILD_NODES_PER_PARCEL) {
    return {
      code: 'too-many-build-nodes',
      message: 'Parcel build node limit exceeded',
      ok: false,
    }
  }

  const encoded = JSON.stringify(value)
  if (encoded.length > MAX_BUILD_SNAPSHOT_BYTES) {
    return {
      code: 'build-snapshot-too-large',
      message: 'Parcel build snapshot is too large',
      ok: false,
    }
  }

  const nodes: BuildNodeSnapshot[] = []
  for (const candidate of value) {
    const node = sanitizeBuildNode(candidate)
    if (!node) continue
    nodes.push(node)
  }
  const normalizedNodes = sanitizeBuildNodeRelations(nodes)
  normalizedNodes.sort((first, second) => first.id.localeCompare(second.id))
  return { nodes: normalizedNodes, ok: true }
}

function sanitizeBuildNode(value: unknown): BuildNodeSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const rawNode = value as Record<string, unknown>
  const type = typeof rawNode.type === 'string' ? rawNode.type : ''
  if (!LANDRUSH_BUILD_NODE_TYPES.has(type)) return null
  const id = sanitizeBuildNodeId(rawNode.id)
  if (!id) return null

  const node = JSON.parse(JSON.stringify(rawNode)) as BuildNodeSnapshot
  node.id = id
  node.type = type
  node.object = 'node'
  node.visible = node.visible !== false
  if (typeof node.parentId !== 'string') node.parentId = null
  return node
}

function sanitizeBuildNodeRelations(nodes: BuildNodeSnapshot[]) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  return nodes.map((node) => {
    if (!Array.isArray(node.children)) return node

    const children = node.children.filter((childId): childId is string => {
      if (typeof childId !== 'string') return false
      const child = nodesById.get(childId)
      return Boolean(child && child.parentId === node.id)
    })
    return { ...node, children }
  })
}

function sanitizeBuildNodeId(value: unknown) {
  if (typeof value !== 'string') return ''
  return value
    .trim()
    .slice(0, 120)
    .replace(/[^a-zA-Z0-9._:-]/g, '-')
}

function finiteNumber(value: number | undefined, fallback: number): number
function finiteNumber(value: number | undefined, fallback: undefined): number | undefined
function finiteNumber(value: number | undefined, fallback: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}
