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
  position: [number, number, number]
  speed: number
  updatedAt: number
}

type ClientMessage =
  | { player: PlayerSnapshot; roomId?: string; type: 'join' }
  | { player: PlayerSnapshot; type: 'state' }
  | { sentAt?: number; type: 'heartbeat' }
  | { type: 'leave' }

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

const DEFAULT_ROOM_ID = 'landrush-lab-world-multiplayer'
const HEARTBEAT_INTERVAL_MS = 3000
const MAX_ROOM_ID_LENGTH = 80
const MAX_ROOM_PEERS = 32
const MIN_STATE_INTERVAL_MS = 40
const PEER_STALE_MS = 15_000

// Instance-local room state. On scaled Vercel deployments, durable room state/pubsub belongs in
// an external store because reconnects may land on another function instance.
const rooms = new Map<string, Map<string, Peer>>()

export async function GET(request: Request) {
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('WebSocket upgrade required', { status: 426 })
  }

  return experimental_upgradeWebSocket((socket) => {
    const connectionId = crypto.randomUUID()
    let peer: Peer | null = null

    send(socket, {
      connectionId,
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      maxPeers: MAX_ROOM_PEERS,
      serverTime: Date.now(),
      stalePeerMs: PEER_STALE_MS,
      type: 'welcome',
    })

    socket.on('message', (data) => {
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
        const existingPeer = room.get(player.id)

        if (!existingPeer && room.size >= MAX_ROOM_PEERS) {
          sendError(socket, 'room-full', 'Room is full')
          socket.close(1013, 'Room is full')
          return
        }

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

      if (message.type === 'heartbeat') {
        if (peer) peer.lastSeenAt = now
        send(socket, {
          playerCount: peer ? (rooms.get(peer.roomId)?.size ?? 1) : undefined,
          roomId: peer?.roomId,
          sentAt: finiteNumber(message.sentAt, undefined),
          serverTime: now,
          type: 'heartbeat',
        })
        return
      }

      leaveRoom(peer, true, 'left')
      peer = null
    })

    socket.on('close', () => {
      leaveRoom(peer, true, 'closed')
      peer = null
    })

    socket.on('error', () => {
      leaveRoom(peer, true, 'error')
      peer = null
    })
  })
}

function joinRoom(peer: Peer) {
  const room = getRoom(peer.roomId)
  const previousPeer = room.get(peer.id)
  if (previousPeer && previousPeer.socket !== peer.socket) {
    previousPeer.socket.close(1000, 'Replaced by a newer connection')
  }

  room.set(peer.id, peer)
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

function leaveRoom(peer: Peer | null, announce: boolean, reason?: string) {
  if (!peer) return

  const room = rooms.get(peer.roomId)
  if (!room || room.get(peer.id) !== peer) return

  room.delete(peer.id)
  const now = Date.now()
  if (room.size === 0) {
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

function sweepStalePeers(now: number) {
  for (const room of rooms.values()) {
    for (const peer of room.values()) {
      if (now - peer.lastSeenAt <= PEER_STALE_MS) continue
      peer.socket.close(1001, 'Stale peer')
      leaveRoom(peer, true, 'stale')
    }
  }
}

function broadcastRoomState(roomId: string) {
  const room = rooms.get(roomId)
  if (!room) return

  broadcast(roomId, {
    playerCount: room.size,
    roomId,
    serverTime: Date.now(),
    type: 'room-state',
  })
}

function broadcast(roomId: string, message: ServerMessage, exceptPeerId?: string) {
  const room = rooms.get(roomId)
  if (!room) return

  for (const roomPeer of room.values()) {
    if (roomPeer.id === exceptPeerId) continue
    send(roomPeer.socket, message)
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
    room = new Map()
    rooms.set(roomId, room)
  }
  return room
}

function roomSnapshots(room: Map<string, Peer>, exceptPeerId?: string) {
  return [...room.values()]
    .filter((roomPeer) => roomPeer.id !== exceptPeerId)
    .map((roomPeer) => roomPeer.player)
    .sort((first, second) => first.name.localeCompare(second.name))
}

function parseClientMessage(data: WebSocketData): ClientMessage | null {
  try {
    const raw = JSON.parse(data.toString()) as ClientMessage
    if (raw?.type === 'join' && isPlayerSnapshot(raw.player)) return raw
    if (raw?.type === 'state' && isPlayerSnapshot(raw.player)) return raw
    if (raw?.type === 'heartbeat') return raw
    if (raw?.type === 'leave') return raw
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

function finiteNumber(value: number | undefined, fallback: number): number
function finiteNumber(value: number | undefined, fallback: undefined): number | undefined
function finiteNumber(value: number | undefined, fallback: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
