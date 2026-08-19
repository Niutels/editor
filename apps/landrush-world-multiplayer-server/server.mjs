import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  isSpatialVoiceSignalPayload,
  sanitizeMultiplayerRoomId,
  isParcelBuildSchemaVersion,
  normalizeParcelBuildRevision,
  PARCEL_BUILD_SCHEMA_VERSION,
} from '@landrush/protocol'
import { WebSocket, WebSocketServer } from 'ws'

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
const MAX_ROOM_PEERS = 32
const MIN_STATE_INTERVAL_MS = 40
const PEER_STALE_MS = 15_000
const PORT = Number(process.env.PORT ?? process.env.LANDRUSH_WORLD_MULTIPLAYER_WS_PORT ?? 3003)
const WS_PATH = process.env.LANDRUSH_WORLD_MULTIPLAYER_WS_PATH ?? '/api/landrush-lab/world-multiplayer/ws'
const PERSISTENT_STATE_SCHEMA_VERSION = 2
const ALLOW_EMPTY_PERSISTENT_STATE =
  process.env.LANDRUSH_WORLD_MULTIPLAYER_ALLOW_EMPTY_STATE === '1'
const PERSISTENT_STATE_FILE = resolvePersistentStateFile()
const persistentStateStatus = {
  backupAvailable: false,
  enabled: Boolean(PERSISTENT_STATE_FILE),
  lastError: null,
  migrated: false,
  restored: false,
}

const rooms = new Map()
const parcelBuildNodesByWorld = new Map()
const parcelOwnershipByWorld = new Map()
const tvMediaStateByWorld = new Map()
let persistentStateRequestedRevision = 0
let persistentStateWrittenRevision = 0
let persistentStateWriteRunning = false
const startedAt = Date.now()

await restorePersistentWorldState()

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
        persistence: persistentStateHealth(),
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
      const roomId = sanitizeMultiplayerRoomId(message.roomId)
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
      const roomId = sanitizeMultiplayerRoomId(message.roomId)
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
      const roomId = sanitizeMultiplayerRoomId(message.roomId ?? peer?.roomId ?? watcher?.roomId)
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
      const synced = syncParcelBuildNodes(peer, message, now)
      if (!synced.ok) {
        if (synced.code === 'parcel-build-conflict') {
          send(socket, {
            build: synced.build,
            operationId: synced.operationId,
            reason: synced.message,
            roomId: peer.roomId,
            serverTime: now,
            type: 'parcel-build-nodes-conflict',
          })
          return
        }
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

function forwardVoiceSignal(peer, targetPeerIdValue, signal, now) {
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
  queuePersistentWorldStateWrite()
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

function sendTvMediaStateSnapshot(socket, roomId, worldId) {
  send(socket, {
    roomId,
    serverTime: Date.now(),
    tvs: tvMediaStateSnapshot(worldId),
    type: 'tv-media-state-snapshot',
    worldId,
  })
}

function syncParcelBuildNodes(peer, message, now) {
  const worldId = sanitizeParcelWorldId(message.worldId)
  const parcelId = sanitizeParcelId(message.parcelId)
  const ownership = getParcelOwnerships(worldId).get(parcelId)
  if (!ownership || ownership.owner.id !== peer.id) {
    return {
      code: 'parcel-build-not-owned',
      message: 'Only the parcel owner can sync build nodes',
      ok: false,
    }
  }

  if (!isParcelBuildSchemaVersion(message.schemaVersion)) {
    return {
      code: 'unsupported-parcel-build-schema',
      message: `Parcel build schema ${message.schemaVersion} is not supported`,
      ok: false,
    }
  }

  const operationId = sanitizeText(message.operationId, '', 120)
  if (!operationId) {
    return {
      code: 'bad-parcel-build-operation',
      message: 'Parcel build operation ID is required',
      ok: false,
    }
  }

  const builds = getParcelBuildNodes(worldId)
  const currentBuild = builds.get(parcelId) ?? null
  if (currentBuild?.operationId === operationId) {
    return { build: currentBuild, duplicate: true, ok: true }
  }

  const currentRevision = currentBuild?.revision ?? 0
  if (message.baseRevision !== currentRevision) {
    return {
      build: currentBuild,
      code: 'parcel-build-conflict',
      message: `Parcel build revision changed from ${message.baseRevision} to ${currentRevision}`,
      ok: false,
      operationId,
    }
  }

  const nodes = sanitizeBuildNodes(message.nodes)
  if (!nodes.ok) return nodes

  const build = {
    nodes: nodes.nodes,
    operationId,
    parcelId,
    revision: currentRevision + 1,
    schemaVersion: PARCEL_BUILD_SCHEMA_VERSION,
    updatedAt: now,
    updatedBy: peer.id,
    worldId,
  }
  builds.set(parcelId, build)
  queuePersistentWorldStateWrite()
  return { build, ok: true }
}

function syncTvMediaState(peer, message, now) {
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
  queuePersistentWorldStateWrite()
  return { ok: true, tv }
}

function getParcelBuildNodes(worldId) {
  let builds = parcelBuildNodesByWorld.get(worldId)
  if (!builds) {
    builds = new Map()
    parcelBuildNodesByWorld.set(worldId, builds)
  }
  return builds
}

function getTvMediaStates(worldId) {
  let tvs = tvMediaStateByWorld.get(worldId)
  if (!tvs) {
    tvs = new Map()
    tvMediaStateByWorld.set(worldId, tvs)
  }
  return tvs
}

function parcelBuildNodesSnapshot(worldId) {
  return [...(parcelBuildNodesByWorld.get(worldId)?.values() ?? [])].sort((first, second) =>
    first.parcelId.localeCompare(second.parcelId),
  )
}

function tvMediaStateSnapshot(worldId) {
  return [...(tvMediaStateByWorld.get(worldId)?.values() ?? [])].sort((first, second) =>
    first.tvId.localeCompare(second.tvId),
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

function resolvePersistentStateFile() {
  const configuredPath = process.env.LANDRUSH_WORLD_MULTIPLAYER_STATE_FILE?.trim()
  if (configuredPath?.toLowerCase() === 'off') return null
  if (configuredPath) return resolve(configuredPath)
  const configuredDataDirectory = process.env.LANDRUSH_WORLD_MULTIPLAYER_DATA_DIR?.trim()
  if (configuredDataDirectory) {
    return resolve(configuredDataDirectory, 'world-multiplayer-state.json')
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Production multiplayer requires LANDRUSH_WORLD_MULTIPLAYER_DATA_DIR or LANDRUSH_WORLD_MULTIPLAYER_STATE_FILE. Point it outside the deployed release, or explicitly set the state file to off for a stateless server.',
    )
  }
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../.landrush-local/world-multiplayer-state.json',
  )
}

async function restorePersistentWorldState() {
  if (!PERSISTENT_STATE_FILE) return
  let encoded
  try {
    encoded = await readFile(PERSISTENT_STATE_FILE, 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      if (process.env.NODE_ENV === 'production' && !ALLOW_EMPTY_PERSISTENT_STATE) {
        throw new Error(
          'The configured production multiplayer save does not exist. Restore it before starting, or set LANDRUSH_WORLD_MULTIPLAYER_ALLOW_EMPTY_STATE=1 only for the first boot of a new world.',
        )
      }
      return
    }
    persistentStateStatus.lastError = errorMessage(error)
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `Could not read the configured production multiplayer save: ${persistentStateStatus.lastError}`,
      )
    }
    console.warn(`Could not read Landrush local save: ${persistentStateStatus.lastError}`)
    return
  }

  try {
    const snapshot = JSON.parse(encoded)
    if (
      ![1, PERSISTENT_STATE_SCHEMA_VERSION].includes(snapshot?.schemaVersion) ||
      !Array.isArray(snapshot.worlds)
    ) {
      throw new Error('Unsupported local-save schema')
    }
    const needsCanonicalRewrite = persistentStateNeedsCanonicalRewrite(snapshot)

    let buildCount = 0
    let ownershipCount = 0
    let tvCount = 0
    for (const candidate of snapshot.worlds) {
      if (!candidate || typeof candidate !== 'object' || typeof candidate.worldId !== 'string') {
        continue
      }
      const worldId = sanitizeParcelWorldId(candidate.worldId)
      const ownerships = new Map()
      for (const value of Array.isArray(candidate.ownerships) ? candidate.ownerships : []) {
        const ownership = sanitizePersistentParcelOwnership(value, worldId)
        if (ownership) ownerships.set(ownership.parcelId, ownership)
      }
      const builds = new Map()
      for (const value of Array.isArray(candidate.builds) ? candidate.builds : []) {
        const build = sanitizePersistentParcelBuild(value, worldId)
        if (build) builds.set(build.parcelId, build)
      }
      const tvs = new Map()
      for (const value of Array.isArray(candidate.tvMediaStates) ? candidate.tvMediaStates : []) {
        const tv = sanitizePersistentTvMediaState(value, worldId)
        if (tv) tvs.set(tv.tvId, tv)
      }

      if (ownerships.size > 0) parcelOwnershipByWorld.set(worldId, ownerships)
      if (builds.size > 0) parcelBuildNodesByWorld.set(worldId, builds)
      if (tvs.size > 0) tvMediaStateByWorld.set(worldId, tvs)
      ownershipCount += ownerships.size
      buildCount += builds.size
      tvCount += tvs.size
    }
    persistentStateStatus.backupAvailable = await ensurePersistentWorldStateBackup(encoded)
    persistentStateStatus.restored = true
    if (needsCanonicalRewrite) {
      await writePersistentWorldState(createPersistentWorldStateSnapshot())
      persistentStateStatus.migrated = true
    }
    console.log(
      `Restored Landrush local save (${ownershipCount} parcels, ${buildCount} builds, ${tvCount} TVs)`,
    )
  } catch (error) {
    persistentStateStatus.lastError = errorMessage(error)
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `Could not restore the configured production multiplayer save: ${persistentStateStatus.lastError}`,
      )
    }
    console.warn(`Could not restore Landrush local save: ${persistentStateStatus.lastError}`)
  }
}

function persistentStateNeedsCanonicalRewrite(snapshot) {
  if (snapshot.schemaVersion !== PERSISTENT_STATE_SCHEMA_VERSION) return true
  return snapshot.worlds.some((world) =>
    (Array.isArray(world?.builds) ? world.builds : []).some(
      (build) =>
        typeof build?.operationId !== 'string' ||
        !build.operationId ||
        !Number.isSafeInteger(build.revision) ||
        build.revision < 0 ||
        !isParcelBuildSchemaVersion(build.schemaVersion),
    ),
  )
}

async function ensurePersistentWorldStateBackup(encoded) {
  if (!PERSISTENT_STATE_FILE) return false
  const digest = createHash('sha256').update(encoded).digest('hex').slice(0, 16)
  const backupDirectory = resolve(dirname(PERSISTENT_STATE_FILE), 'backups')
  const backupFile = resolve(
    backupDirectory,
    `${basename(PERSISTENT_STATE_FILE)}.${digest}.json`,
  )
  await mkdir(backupDirectory, { recursive: true })
  try {
    await writeFile(backupFile, encoded, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if (!(error && typeof error === 'object' && error.code === 'EEXIST')) throw error
  }
  return true
}

function persistentStateHealth() {
  const buildCount = [...parcelBuildNodesByWorld.values()].reduce(
    (count, builds) => count + builds.size,
    0,
  )
  const ownershipCount = [...parcelOwnershipByWorld.values()].reduce(
    (count, ownerships) => count + ownerships.size,
    0,
  )
  const tvCount = [...tvMediaStateByWorld.values()].reduce(
    (count, tvs) => count + tvs.size,
    0,
  )
  return {
    backupAvailable: persistentStateStatus.backupAvailable,
    buildCount,
    enabled: persistentStateStatus.enabled,
    lastError: persistentStateStatus.lastError,
    migrated: persistentStateStatus.migrated,
    ownershipCount,
    restored: persistentStateStatus.restored,
    schemaVersion: PERSISTENT_STATE_SCHEMA_VERSION,
    tvCount,
  }
}

function queuePersistentWorldStateWrite() {
  if (!PERSISTENT_STATE_FILE) return
  persistentStateRequestedRevision += 1
  void flushPersistentWorldState()
}

async function flushPersistentWorldState() {
  if (persistentStateWriteRunning) return
  persistentStateWriteRunning = true
  try {
    while (persistentStateWrittenRevision < persistentStateRequestedRevision) {
      const targetRevision = persistentStateRequestedRevision
      try {
        await writePersistentWorldState(createPersistentWorldStateSnapshot())
        persistentStateWrittenRevision = targetRevision
        persistentStateStatus.lastError = null
      } catch (error) {
        persistentStateStatus.lastError = errorMessage(error)
        console.error(`Could not write Landrush local save: ${persistentStateStatus.lastError}`)
        break
      }
    }
  } finally {
    persistentStateWriteRunning = false
    if (persistentStateWrittenRevision < persistentStateRequestedRevision) {
      const retry = setTimeout(() => void flushPersistentWorldState(), 1000)
      retry.unref()
    }
  }
}

function createPersistentWorldStateSnapshot() {
  const worldIds = new Set([
    ...parcelOwnershipByWorld.keys(),
    ...parcelBuildNodesByWorld.keys(),
    ...tvMediaStateByWorld.keys(),
  ])
  return {
    savedAt: Date.now(),
    schemaVersion: PERSISTENT_STATE_SCHEMA_VERSION,
    worlds: [...worldIds]
      .sort((first, second) => first.localeCompare(second))
      .map((worldId) => ({
        builds: parcelBuildNodesSnapshot(worldId),
        ownerships: parcelOwnershipSnapshot(worldId),
        tvMediaStates: tvMediaStateSnapshot(worldId),
        worldId,
      })),
  }
}

async function writePersistentWorldState(snapshot) {
  if (!PERSISTENT_STATE_FILE) return
  const temporaryFile = `${PERSISTENT_STATE_FILE}.${process.pid}.tmp`
  await mkdir(dirname(PERSISTENT_STATE_FILE), { recursive: true })
  try {
    await writeFile(temporaryFile, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
    await rename(temporaryFile, PERSISTENT_STATE_FILE)
  } catch (error) {
    await rm(temporaryFile, { force: true }).catch(() => undefined)
    throw error
  }
}

function sanitizePersistentParcelOwnership(value, worldId) {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof value.parcelId !== 'string' ||
    !value.parcelId.trim() ||
    typeof value.owner?.id !== 'string' ||
    !value.owner.id.trim()
  ) {
    return null
  }
  return {
    claimedAt: Math.max(0, finiteNumber(value.claimedAt, 0)),
    owner: {
      color: sanitizeColor(value.owner.color),
      id: sanitizeText(value.owner.id, '', 80),
      name: sanitizeText(value.owner.name, 'Player', 32),
    },
    parcelId: sanitizeParcelId(value.parcelId),
    worldId,
  }
}

function sanitizePersistentParcelBuild(value, worldId) {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof value.parcelId !== 'string' ||
    !value.parcelId.trim()
  ) {
    return null
  }
  const nodes = sanitizeBuildNodes(value.nodes)
  if (!nodes.ok) return null
  const parcelId = sanitizeParcelId(value.parcelId)
  const revision = normalizeParcelBuildRevision(value.revision)
  return {
    nodes: nodes.nodes,
    operationId: sanitizeText(value.operationId, `restored-${parcelId}-${revision}`, 120),
    parcelId,
    revision,
    schemaVersion: PARCEL_BUILD_SCHEMA_VERSION,
    updatedAt: Math.max(0, finiteNumber(value.updatedAt, 0)),
    updatedBy: sanitizeText(value.updatedBy, 'local-save', 80),
    worldId,
  }
}

function sanitizePersistentTvMediaState(value, worldId) {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof value.parcelId !== 'string' ||
    !value.parcelId.trim() ||
    typeof value.tvId !== 'string' ||
    !value.tvId.trim()
  ) {
    return null
  }
  const url = sanitizeText(value.url, '', 2048)
  return {
    muted: Boolean(value.muted),
    parcelId: sanitizeParcelId(value.parcelId),
    playbackSeconds: Math.max(0, finiteNumber(value.playbackSeconds, 0)),
    playbackUpdatedAt: Math.max(0, finiteNumber(value.playbackUpdatedAt, value.updatedAt ?? 0)),
    playing: typeof value.playing === 'boolean' ? value.playing : Boolean(url),
    tvId: sanitizeParcelKey(value.tvId, 'tv', 120),
    updatedAt: Math.max(0, finiteNumber(value.updatedAt, 0)),
    updatedBy: sanitizeText(value.updatedBy, 'local-save', 80),
    url,
    userVolume: clamp01(finiteNumber(value.userVolume, 0.8)),
    worldId,
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
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
      raw?.type === 'voice-signal' &&
      typeof raw.to === 'string' &&
      isSpatialVoiceSignalPayload(raw.signal)
    ) {
      return raw
    }
    if (
      raw?.type === 'sync-parcel-build-nodes' &&
      typeof raw.worldId === 'string' &&
      typeof raw.parcelId === 'string' &&
      Number.isSafeInteger(raw.schemaVersion) &&
      typeof raw.operationId === 'string' &&
      raw.operationId.length > 0 &&
      Number.isSafeInteger(raw.baseRevision) &&
      raw.baseRevision >= 0 &&
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

function isPlayerSnapshot(value) {
  return (
    typeof value?.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.color === 'string' &&
    Array.isArray(value.position) &&
    value.position.length === 3
  )
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

function clamp01(value) {
  return Math.max(0, Math.min(1, value))
}
