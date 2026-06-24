import { randomUUID } from 'node:crypto'
import http from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'

const DEFAULT_ROOM_ID = 'landrush-lab-world-multiplayer'
const HEARTBEAT_INTERVAL_MS = 3000
const MAX_ROOM_ID_LENGTH = 80
const MAX_ROOM_PEERS = 32
const MIN_STATE_INTERVAL_MS = 40
const PEER_STALE_MS = 15_000
const PORT = Number(process.env.PORT ?? process.env.LANDRUSH_WORLD_MULTIPLAYER_WS_PORT ?? 3003)
const WS_PATH = process.env.LANDRUSH_WORLD_MULTIPLAYER_WS_PATH ?? '/api/landrush-lab/world-multiplayer/ws'

const rooms = new Map()
const startedAt = Date.now()

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  const headers = {
    'access-control-allow-origin': process.env.LANDRUSH_WORLD_MULTIPLAYER_CORS_ORIGIN ?? '*',
    'content-type': 'application/json; charset=utf-8',
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      ...headers,
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,OPTIONS',
    })
    response.end()
    return
  }

  if (url.pathname === '/health') {
    response.writeHead(200, headers)
    response.end(
      JSON.stringify({
        ok: true,
        rooms: rooms.size,
        serverTime: Date.now(),
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        wsPath: WS_PATH,
      }),
    )
    return
  }

  if (url.pathname === '/rooms') {
    response.writeHead(200, headers)
    response.end(JSON.stringify({ rooms: roomSummaries(), serverTime: Date.now() }))
    return
  }

  if (url.pathname === '/metrics') {
    const playerCount = [...rooms.values()].reduce((count, room) => count + room.size, 0)
    response.writeHead(200, headers)
    response.end(
      JSON.stringify({
        maxPeers: MAX_ROOM_PEERS,
        players: playerCount,
        rooms: rooms.size,
        serverTime: Date.now(),
        stalePeerMs: PEER_STALE_MS,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      }),
    )
    return
  }

  response.writeHead(404, headers)
  response.end(JSON.stringify({ error: 'not-found' }))
})

const wss = new WebSocketServer({ path: WS_PATH, server })

wss.on('connection', (socket) => {
  const connectionId = randomUUID()
  let peer = null

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

server.listen(PORT, () => {
  console.log(`Landrush world multiplayer listening on port ${PORT}`)
  console.log(`WebSocket path: ${WS_PATH}`)
})

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`Landrush world multiplayer already has a listener on port ${PORT}`)
    process.exit(0)
  }

  console.error(error)
  process.exitCode = 1
})

function joinRoom(peer) {
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

function leaveRoom(peer, announce, reason) {
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

function sweepStalePeers(now) {
  for (const room of rooms.values()) {
    for (const peer of room.values()) {
      if (now - peer.lastSeenAt <= PEER_STALE_MS) continue
      peer.socket.close(1001, 'Stale peer')
      leaveRoom(peer, true, 'stale')
    }
  }
}

function broadcastRoomState(roomId) {
  const room = rooms.get(roomId)
  if (!room) return
  broadcast(roomId, {
    playerCount: room.size,
    roomId,
    serverTime: Date.now(),
    type: 'room-state',
  })
}

function broadcast(roomId, message, exceptPeerId) {
  const room = rooms.get(roomId)
  if (!room) return

  for (const roomPeer of room.values()) {
    if (roomPeer.id === exceptPeerId) continue
    send(roomPeer.socket, message)
  }
}

function send(socket, message) {
  if (socket.readyState !== WebSocket.OPEN) return false

  try {
    socket.send(JSON.stringify(message))
    return true
  } catch {
    socket.close(1011, 'Failed to send multiplayer message')
    return false
  }
}

function sendError(socket, code, message) {
  send(socket, { code, message, serverTime: Date.now(), type: 'error' })
}

function getRoom(roomId) {
  let room = rooms.get(roomId)
  if (!room) {
    room = new Map()
    rooms.set(roomId, room)
  }
  return room
}

function roomSnapshots(room, exceptPeerId) {
  return [...room.values()]
    .filter((roomPeer) => roomPeer.id !== exceptPeerId)
    .map((roomPeer) => roomPeer.player)
    .sort((first, second) => first.name.localeCompare(second.name))
}

function roomSummaries() {
  return [...rooms.entries()]
    .map(([roomId, room]) => ({
      players: room.size,
      roomId,
      updatedAt: Math.max(...[...room.values()].map((peer) => peer.lastSeenAt)),
    }))
    .sort((first, second) => first.roomId.localeCompare(second.roomId))
}

function parseClientMessage(data) {
  try {
    const raw = JSON.parse(data.toString())
    if (raw?.type === 'join' && isPlayerSnapshot(raw.player)) return raw
    if (raw?.type === 'state' && isPlayerSnapshot(raw.player)) return raw
    if (raw?.type === 'heartbeat') return raw
    if (raw?.type === 'leave') return raw
  } catch {
    return null
  }
  return null
}

function isPlayerSnapshot(value) {
  return (
    typeof value?.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.color === 'string' &&
    Array.isArray(value.position) &&
    value.position.length === 3
  )
}

function sanitizeRoomId(roomId) {
  const normalized = typeof roomId === 'string' ? roomId.trim() : ''
  if (!normalized) return DEFAULT_ROOM_ID
  return normalized.slice(0, MAX_ROOM_ID_LENGTH).replace(/[^a-zA-Z0-9_-]/g, '-')
}

function sanitizePlayerSnapshot(player, now) {
  return {
    color: sanitizeColor(player.color),
    heading: finiteNumber(player.heading, 0),
    id: sanitizeText(player.id, randomUUID(), 80),
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

function sanitizeText(value, fallback, maxLength) {
  const text = typeof value === 'string' ? value.trim() : ''
  return (text || fallback).slice(0, maxLength)
}

function sanitizeColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#7dd3fc'
}

function finiteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
