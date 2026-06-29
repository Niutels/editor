import { randomUUID } from 'node:crypto'
import http from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'

const DEFAULT_ROOM_ID = 'landrush-lab-world-multiplayer'
const HEARTBEAT_INTERVAL_MS = 3000
const LANDRUSH_BUILD_NODE_TYPES = new Set([
  'ceiling',
  'column',
  'door',
  'elevator',
  'fence',
  'item',
  'slab',
  'stair',
  'wall',
  'window',
])
const MAX_BUILD_NODES_PER_PARCEL = 240
const MAX_BUILD_SNAPSHOT_BYTES = 320_000
const MAX_ROOM_ID_LENGTH = 80
const MAX_ROOM_PEERS = 32
const MIN_STATE_INTERVAL_MS = 40
const PEER_STALE_MS = 15_000
const PORT = Number(process.env.PORT ?? process.env.LANDRUSH_WORLD_MULTIPLAYER_WS_PORT ?? 3003)
const WS_PATH = process.env.LANDRUSH_WORLD_MULTIPLAYER_WS_PATH ?? '/api/landrush-lab/world-multiplayer/ws'

const rooms = new Map()
const parcelBuildNodesByWorld = new Map()
const parcelOwnershipByWorld = new Map()
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
    const playerCount = [...rooms.values()].reduce((count, room) => count + room.peers.size, 0)
    const watcherCount = [...rooms.values()].reduce(
      (count, room) => count + room.watchers.size,
      0,
    )
    response.writeHead(200, headers)
    response.end(
      JSON.stringify({
        maxPeers: MAX_ROOM_PEERS,
        players: playerCount,
        rooms: rooms.size,
        serverTime: Date.now(),
        stalePeerMs: PEER_STALE_MS,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        watchers: watcherCount,
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
  let watcher = null

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
      sendParcelOwnershipSnapshot(
        socket,
        roomId,
        worldId,
      )
      sendParcelBuildNodesSnapshot(socket, roomId, worldId)
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
        { ownership: claim.ownership, roomId: peer.roomId, serverTime: now, type: 'parcel-owned' },
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

function watchRoom(watcher) {
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

function leaveRoom(peer, announce, reason) {
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

function leaveWatcher(watcher) {
  if (!watcher) return
  const room = rooms.get(watcher.roomId)
  if (!room) return
  room.watchers.delete(watcher)
  if (roomIsEmpty(room)) rooms.delete(watcher.roomId)
}

function sweepStalePeers(now) {
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

function broadcastRoomState(roomId) {
  const room = rooms.get(roomId)
  if (!room) return
  broadcast(roomId, {
    playerCount: room.peers.size,
    roomId,
    serverTime: Date.now(),
    type: 'room-state',
  })
}

function claimParcel(peer, worldIdValue, parcelIdValue, now) {
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

  const ownership = {
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

function sendParcelOwnershipSnapshot(socket, roomId, worldId) {
  send(socket, {
    ownerships: parcelOwnershipSnapshot(worldId),
    roomId,
    serverTime: Date.now(),
    type: 'parcel-ownership-snapshot',
    worldId,
  })
}

function sendParcelBuildNodesSnapshot(socket, roomId, worldId) {
  send(socket, {
    builds: parcelBuildNodesSnapshot(worldId),
    roomId,
    serverTime: Date.now(),
    type: 'parcel-build-nodes-snapshot',
    worldId,
  })
}

function syncParcelBuildNodes(peer, worldIdValue, parcelIdValue, nodesValue, now) {
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

function getParcelBuildNodes(worldId) {
  let builds = parcelBuildNodesByWorld.get(worldId)
  if (!builds) {
    builds = new Map()
    parcelBuildNodesByWorld.set(worldId, builds)
  }
  return builds
}

function parcelBuildNodesSnapshot(worldId) {
  return [...(parcelBuildNodesByWorld.get(worldId)?.values() ?? [])].sort((first, second) =>
    first.parcelId.localeCompare(second.parcelId),
  )
}

function sendParcelClaimRejected(socket, rejection) {
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

function getParcelOwnerships(worldId) {
  let ownerships = parcelOwnershipByWorld.get(worldId)
  if (!ownerships) {
    ownerships = new Map()
    parcelOwnershipByWorld.set(worldId, ownerships)
  }
  return ownerships
}

function parcelOwnershipSnapshot(worldId) {
  return [...(parcelOwnershipByWorld.get(worldId)?.values() ?? [])].sort((first, second) =>
    first.parcelId.localeCompare(second.parcelId),
  )
}

function broadcast(roomId, message, exceptPeerId) {
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
    room = { peers: new Map(), watchers: new Set() }
    rooms.set(roomId, room)
  }
  return room
}

function roomSnapshots(room, exceptPeerId) {
  return [...room.peers.values()]
    .filter((roomPeer) => roomPeer.id !== exceptPeerId)
    .map((roomPeer) => roomPeer.player)
    .sort((first, second) => first.name.localeCompare(second.name))
}

function roomSummaries() {
  return [...rooms.entries()]
    .map(([roomId, room]) => ({
      players: room.peers.size,
      roomId,
      updatedAt: Math.max(
        ...[...room.peers.values()].map((peer) => peer.lastSeenAt),
        ...[...room.watchers].map((watcher) => watcher.lastSeenAt),
      ),
      watchers: room.watchers.size,
    }))
    .sort((first, second) => first.roomId.localeCompare(second.roomId))
}

function roomIsEmpty(room) {
  return room.peers.size === 0 && room.watchers.size === 0
}

function parseClientMessage(data) {
  try {
    const raw = JSON.parse(data.toString())
    if (raw?.type === 'join' && isPlayerSnapshot(raw.player)) return raw
    if (raw?.type === 'state' && isPlayerSnapshot(raw.player)) return raw
    if (raw?.type === 'heartbeat') return raw
    if (raw?.type === 'leave') return raw
    if (raw?.type === 'watch') return raw
    if (raw?.type === 'watch-parcels' && typeof raw.worldId === 'string') return raw
    if (
      raw?.type === 'sync-parcel-build-nodes' &&
      typeof raw.worldId === 'string' &&
      typeof raw.parcelId === 'string' &&
      Array.isArray(raw.nodes)
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

function sanitizeParcelWorldId(value) {
  return sanitizeParcelKey(value, 'landrush-world', 240)
}

function sanitizeParcelId(value) {
  return sanitizeParcelKey(value, 'parcel', 80)
}

function sanitizeParcelKey(value, fallback, maxLength) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return (normalized || fallback).slice(0, maxLength).replace(/[^a-zA-Z0-9._:-]/g, '-')
}

function sanitizeBuildNodes(value) {
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

  const nodes = []
  for (const candidate of value) {
    const node = sanitizeBuildNode(candidate)
    if (!node) continue
    nodes.push(node)
  }
  const normalizedNodes = sanitizeBuildNodeRelations(nodes)
  normalizedNodes.sort((first, second) => first.id.localeCompare(second.id))
  return { nodes: normalizedNodes, ok: true }
}

function sanitizeBuildNode(value) {
  if (!value || typeof value !== 'object') return null
  const type = typeof value.type === 'string' ? value.type : ''
  if (!LANDRUSH_BUILD_NODE_TYPES.has(type)) return null
  const id = sanitizeBuildNodeId(value.id)
  if (!id) return null

  const node = JSON.parse(JSON.stringify(value))
  node.id = id
  node.type = type
  node.object = 'node'
  node.visible = node.visible !== false
  if (typeof node.parentId !== 'string') node.parentId = null
  return node
}

function sanitizeBuildNodeRelations(nodes) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  return nodes.map((node) => {
    if (!Array.isArray(node.children)) return node

    const children = node.children.filter((childId) => {
      if (typeof childId !== 'string') return false
      const child = nodesById.get(childId)
      return Boolean(child && child.parentId === node.id)
    })
    return { ...node, children }
  })
}

function sanitizeBuildNodeId(value) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, 120).replace(/[^a-zA-Z0-9._:-]/g, '-')
}

function finiteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
