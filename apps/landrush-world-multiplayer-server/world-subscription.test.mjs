import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import { after, test } from 'node:test'
import { PARCEL_BUILD_SCHEMA_VERSION } from '@landrush/protocol'
import { WebSocket } from 'ws'

const WS_PATH = '/api/landrush-lab/world-multiplayer/ws'
const children = new Set()

after(() => {
  for (const child of children) child.kill()
})

test('broadcasts world authority updates to subscribers in different presence rooms', async () => {
  const port = await getOpenPort()
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      LANDRUSH_WORLD_MULTIPLAYER_STATE_FILE: 'off',
      LANDRUSH_WORLD_MULTIPLAYER_WS_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(server)
  server.on('exit', () => children.delete(server))
  await waitForServer(port)

  const builder = await connectPlayer(port, 'world-builder', 'presence-room-a')
  const observer = await connectWatcher(port, 'presence-room-b')
  const worldId = 'shared-authority-world'
  const parcelId = 'parcel-1'
  try {
    await watchWorld(builder, worldId)
    await watchWorld(observer, worldId)

    builder.socket.send(JSON.stringify({ parcelId, type: 'claim-parcel', worldId }))
    await nextMessage(builder, (message) => message.type === 'parcel-claim-result')
    const owned = await nextMessage(observer, (message) => message.type === 'parcel-owned')
    assert.equal(owned.roomId, 'presence-room-b')
    assert.equal(owned.ownership.parcelId, parcelId)

    builder.socket.send(
      JSON.stringify({
        baseRevision: 0,
        nodes: [createWall()],
        operationId: 'cross-room-build',
        parcelId,
        schemaVersion: PARCEL_BUILD_SCHEMA_VERSION,
        type: 'sync-parcel-build-nodes',
        worldId,
        writerEpoch: builder.writerEpoch,
        writerSessionId: builder.writerSessionId,
      }),
    )
    await nextMessage(builder, (message) => message.type === 'parcel-build-nodes-ack')
    const buildUpdate = await nextMessage(
      observer,
      (message) => message.type === 'parcel-build-nodes-updated',
    )
    assert.equal(buildUpdate.roomId, 'presence-room-b')
    assert.equal(buildUpdate.build.operationId, 'cross-room-build')

    builder.socket.send(
      JSON.stringify({
        muted: false,
        parcelId,
        playbackSeconds: 0,
        playing: true,
        tvId: 'tv-cross-room',
        type: 'sync-tv-media-state',
        url: 'https://example.com/video',
        userVolume: 0.5,
        worldId,
      }),
    )
    await nextMessage(builder, (message) => message.type === 'tv-media-state-synced')
    const tvUpdate = await nextMessage(
      observer,
      (message) => message.type === 'tv-media-state-updated',
    )
    assert.equal(tvUpdate.roomId, 'presence-room-b')
    assert.equal(tvUpdate.tv.tvId, 'tv-cross-room')
  } finally {
    builder.socket.close()
    observer.socket.close()
    server.kill()
  }
})

test('relays combat on join, live updates, late observation, and return to normal play', async () => {
  const port = await getOpenPort()
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      LANDRUSH_WORLD_MULTIPLAYER_STATE_FILE: 'off',
      LANDRUSH_WORLD_MULTIPLAYER_WS_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(server)
  server.on('exit', () => children.delete(server))
  await waitForServer(port)
  const roomId = 'combat-presentation-room'
  const clients = []
  const combat = {
    aimAngle: 0.8,
    ammo: 60,
    meleePhase: 'idle',
    meleeProgress: 0,
    shotSequence: 0,
    shots: [],
    weaponIndex: 0,
  }
  try {
    const observer = await connectWatcher(port, roomId)
    clients.push(observer)
    const player = await connectPlayer(port, 'armed-player', roomId, combat)
    clients.push(player)
    const joined = await nextMessage(observer, (message) => message.type === 'player-joined')
    assert.deepEqual(joined.player.combat, combat)

    const fired = {
      ...combat,
      ammo: 71,
      shotSequence: 1,
      shots: [{ id: 8, impactAge: null, position: [4, 1, 2], previousPosition: [3, 1, 2], weaponIndex: 2 }],
      weaponIndex: 2,
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
    player.socket.send(JSON.stringify({ player: { ...createPlayer('armed-player'), combat: fired }, type: 'state' }))
    const update = await nextMessage(observer, (message) => message.type === 'player-state' && message.player.combat?.shotSequence === 1)
    assert.deepEqual(update.player.combat, fired)
    const lateObserver = await connectWatcher(port, roomId)
    clients.push(lateObserver)
    assert.deepEqual(lateObserver.snapshot.players.find((entry) => entry.id === 'armed-player').combat, fired)

    await new Promise((resolve) => setTimeout(resolve, 50))
    player.socket.send(JSON.stringify({ player: createPlayer('armed-player'), type: 'state' }))
    const normal = await nextMessage(observer, (message) => message.type === 'player-state' && message.player.combat === undefined)
    assert.equal(Object.hasOwn(normal.player, 'combat'), false)

    await new Promise((resolve) => setTimeout(resolve, 50))
    player.socket.send(JSON.stringify({ player: { ...createPlayer('armed-player'), combat: { ...combat, weaponIndex: 999 } }, type: 'state' }))
    const invalid = await nextMessage(lateObserver, (message) => message.type === 'player-state' && message.player.updatedAt > normal.player.updatedAt)
    assert.equal(Object.hasOwn(invalid.player, 'combat'), false)
  } finally {
    for (const client of clients) client.socket.close()
    server.kill()
  }
})

function createWall() {
  return {
    children: [],
    end: [2, 0],
    height: 2.5,
    id: 'wall-cross-room',
    object: 'node',
    parentId: null,
    start: [0, 0],
    thickness: 0.2,
    type: 'wall',
    visible: true,
  }
}

async function connectPlayer(port, id, roomId, combat) {
  const client = await openClient(port)
  const writerSessionId = `writer-${id}`
  client.socket.send(
    JSON.stringify({
      player: { ...createPlayer(id), ...(combat ? { combat } : {}) },
      roomId,
      type: 'join',
      writerSessionId,
    }),
  )
  const grant = await nextMessage(
    client,
    (message) => message.type === 'parcel-writer-session-granted',
  )
  await nextMessage(client, (message) => message.type === 'snapshot')
  return { ...client, roomId, writerEpoch: grant.writerEpoch, writerSessionId }
}

async function connectWatcher(port, roomId) {
  const client = await openClient(port)
  client.socket.send(JSON.stringify({ roomId, type: 'watch' }))
  const snapshot = await nextMessage(client, (message) => message.type === 'snapshot')
  return { ...client, roomId, snapshot }
}

async function openClient(port) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`)
  const messages = []
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())))
  await once(socket, 'open')
  const client = { messages, socket }
  await nextMessage(client, (message) => message.type === 'welcome')
  return client
}

async function watchWorld(client, worldId) {
  client.socket.send(
    JSON.stringify({ roomId: client.roomId, type: 'watch-parcels', worldId }),
  )
  await nextMessage(client, (message) => message.type === 'parcel-ownership-snapshot')
  await nextMessage(client, (message) => message.type === 'parcel-build-nodes-snapshot')
  await nextMessage(client, (message) => message.type === 'tv-media-state-snapshot')
}

function createPlayer(id) {
  return {
    color: '#7dd3fc',
    heading: 0,
    id,
    moving: false,
    name: id,
    position: [0, 0, 0],
    speed: 0,
    updatedAt: Date.now(),
  }
}

async function nextMessage(client, predicate) {
  const existingIndex = client.messages.findIndex(predicate)
  if (existingIndex >= 0) {
    const [message] = client.messages.splice(existingIndex, 1)
    return message
  }
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Timed out waiting for WebSocket message'))
    }, 3000)
    const handleMessage = (data) => {
      const message = JSON.parse(data.toString())
      if (!predicate(message)) {
        client.messages.push(message)
        return
      }
      cleanup()
      resolve(message)
    }
    const handleClose = () => {
      cleanup()
      reject(new Error('WebSocket closed before expected message'))
    }
    const cleanup = () => {
      clearTimeout(timeout)
      client.socket.off('message', handleMessage)
      client.socket.off('close', handleClose)
    }
    client.socket.on('message', handleMessage)
    client.socket.on('close', handleClose)
  })
}

async function waitForServer(port) {
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      if (response.ok) return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 80))
    }
  }
  throw new Error('Timed out waiting for multiplayer server')
}

async function getOpenPort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert(address && typeof address === 'object')
  const { port } = address
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  return port
}
