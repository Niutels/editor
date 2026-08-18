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

test('serializes parcel builds by revision and makes retries idempotent', async () => {
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

  const client = await connectPlayer(port, 'builder')
  const worldId = 'revision-test-world'
  const parcelId = 'parcel-1'

  try {
    client.socket.send(JSON.stringify({ parcelId, type: 'claim-parcel', worldId }))
    await nextMessage(client, (message) => message.type === 'parcel-claim-result')

    sendBuild(client, { baseRevision: 0, operationId: 'operation-1', parcelId, worldId })
    const first = await nextMessage(client, (message) => message.type === 'parcel-build-nodes-synced')
    assert.equal(first.build.revision, 1)
    assert.equal(first.build.schemaVersion, PARCEL_BUILD_SCHEMA_VERSION)
    assert.equal(first.build.operationId, 'operation-1')
    client.messages.length = 0

    sendBuild(client, { baseRevision: 0, operationId: 'operation-1', parcelId, worldId })
    const duplicate = await nextMessage(
      client,
      (message) =>
        message.type === 'parcel-build-nodes-synced' &&
        message.build.operationId === 'operation-1',
    )
    assert.equal(duplicate.build.revision, 1)

    sendBuild(client, { baseRevision: 0, operationId: 'operation-2', parcelId, worldId })
    const conflict = await nextMessage(
      client,
      (message) => message.type === 'parcel-build-nodes-conflict',
    )
    assert.equal(conflict.operationId, 'operation-2')
    assert.equal(conflict.build.revision, 1)

    sendBuild(client, { baseRevision: 1, operationId: 'operation-3', parcelId, worldId })
    const second = await nextMessage(
      client,
      (message) =>
        message.type === 'parcel-build-nodes-synced' &&
        message.build.operationId === 'operation-3',
    )
    assert.equal(second.build.revision, 2)
    assert.equal(second.build.operationId, 'operation-3')
  } finally {
    client.socket.close()
    server.kill()
  }
})

function sendBuild(client, { baseRevision, operationId, parcelId, worldId }) {
  client.socket.send(
    JSON.stringify({
      baseRevision,
      nodes: [
        {
          children: [],
          end: [2, 0],
          height: 2.5,
          id: 'wall_revision-test',
          object: 'node',
          parentId: null,
          start: [0, 0],
          thickness: 0.2,
          type: 'wall',
          visible: true,
        },
      ],
      operationId,
      parcelId,
      schemaVersion: PARCEL_BUILD_SCHEMA_VERSION,
      type: 'sync-parcel-build-nodes',
      worldId,
    }),
  )
}

async function connectPlayer(port, id) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`)
  const messages = []
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())))
  await once(socket, 'open')
  await nextMessage({ messages, socket }, (message) => message.type === 'welcome')
  socket.send(
    JSON.stringify({
      player: {
        color: '#7dd3fc',
        heading: 0,
        id,
        moving: false,
        name: id,
        position: [0, 0, 0],
        speed: 0,
        updatedAt: Date.now(),
      },
      roomId: 'parcel-build-revision-test',
      type: 'join',
    }),
  )
  await nextMessage({ messages, socket }, (message) => message.type === 'snapshot')
  return { messages, socket }
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
