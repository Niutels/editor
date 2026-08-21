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

test('serializes parcel builds idempotently and accepts bounded registry node kinds', async () => {
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
    const first = await nextMessage(client, (message) => message.type === 'parcel-build-nodes-ack')
    assert.equal(first.revision, 1)
    assert.equal(first.operationId, 'operation-1')
    client.messages.length = 0

    sendBuild(client, { baseRevision: 0, operationId: 'operation-1', parcelId, worldId })
    const duplicate = await nextMessage(
      client,
      (message) =>
        message.type === 'parcel-build-nodes-ack' && message.operationId === 'operation-1',
    )
    assert.equal(duplicate.revision, 1)

    sendBuild(client, {
      baseRevision: 0,
      nodeId: 'wall-different-content',
      operationId: 'operation-1',
      parcelId,
      worldId,
    })
    const reused = await nextMessage(
      client,
      (message) =>
        message.type === 'parcel-build-nodes-rejected' &&
        message.code === 'parcel-build-operation-reused',
    )
    assert.match(reused.reason, /different content/)

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
        message.type === 'parcel-build-nodes-ack' && message.operationId === 'operation-3',
    )
    assert.equal(second.revision, 2)
    assert.equal(second.operationId, 'operation-3')

    const canonicalWall = createWall('wall-duplicate')
    sendBuild(client, {
      baseRevision: 2,
      nodes: [canonicalWall, canonicalWall],
      operationId: 'duplicate-node-operation',
      parcelId,
      worldId,
    })
    const duplicateNodesRejected = await nextMessage(
      client,
      (message) =>
        message.type === 'parcel-build-nodes-rejected' &&
        message.operationId === 'duplicate-node-operation',
    )
    assert.equal(duplicateNodesRejected.code, 'invalid-build-node-graph')

    sendBuild(client, {
      baseRevision: 2,
      nodes: [
        {
          children: ['wall-child'],
          id: 'building-parent',
          object: 'node',
          parentId: null,
          type: 'building',
          visible: true,
        },
        createWall('wall-child'),
      ],
      operationId: 'mismatched-relation-operation',
      parcelId,
      worldId,
    })
    const relationsRejected = await nextMessage(
      client,
      (message) =>
        message.type === 'parcel-build-nodes-rejected' &&
        message.operationId === 'mismatched-relation-operation',
    )
    assert.equal(relationsRejected.code, 'invalid-build-node-graph')

    sendBuild(client, {
      baseRevision: 2,
      nodes: [
        createGraphNode('plugin-orphan', 'plugin:future-node', 'external-parent-not-in-snapshot'),
      ],
      operationId: 'missing-parent-operation',
      parcelId,
      worldId,
    })
    const missingParentRejected = await nextMessage(
      client,
      (message) =>
        message.type === 'parcel-build-nodes-rejected' &&
        message.operationId === 'missing-parent-operation',
    )
    assert.equal(missingParentRejected.code, 'invalid-build-node-graph')

    sendBuild(client, {
      baseRevision: 2,
      operationId: 'legacy-operation',
      parcelId,
      schemaVersion: 1,
      worldId,
    })
    const legacyRejected = await nextMessage(
      client,
      (message) =>
        message.type === 'parcel-build-nodes-rejected' &&
        message.code === 'unsupported-parcel-build-schema',
    )
    assert.match(legacyRejected.reason, /not supported/)

    sendBuild(client, {
      baseRevision: 2,
      nodes: createCanonicalParcelGraph(),
      operationId: 'operation-4',
      parcelId,
      worldId,
    })
    const afterRejections = await nextMessage(
      client,
      (message) =>
        message.type === 'parcel-build-nodes-ack' && message.operationId === 'operation-4',
    )
    assert.equal(afterRejections.revision, 3)

    client.socket.send(createDeepBuildMessage(client, parcelId, worldId))
    const deepBuildRejected = await nextMessage(
      client,
      (message) =>
        message.type === 'parcel-build-nodes-rejected' &&
        message.operationId === 'deep-build-operation',
    )
    assert.equal(deepBuildRejected.code, 'bad-build-nodes')
    const health = await fetch(`http://127.0.0.1:${port}/health`)
    assert.equal(health.ok, true)
  } finally {
    client.socket.close()
    server.kill()
  }
})

test('reconnects the same writer session and idempotently acknowledges a lost ack', async () => {
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

  const worldId = 'lost-ack-world'
  const parcelId = 'parcel-1'
  const writerSessionId = 'writer-lost-ack'
  let client = await connectPlayer(port, 'lost-ack-builder', writerSessionId)
  try {
    client.socket.send(JSON.stringify({ parcelId, type: 'claim-parcel', worldId }))
    await nextMessage(client, (message) => message.type === 'parcel-claim-result')
    sendBuild(client, { baseRevision: 0, operationId: 'stable-operation', parcelId, worldId })
    await nextMessage(client, (message) => message.type === 'parcel-build-nodes-ack')
    const clientClosed = once(client.socket, 'close')
    client.socket.close()
    await clientClosed

    const previousWriterEpoch = client.writerEpoch
    client = await connectPlayer(port, 'lost-ack-builder', writerSessionId, previousWriterEpoch)
    assert.equal(client.writerEpoch, 1)
    sendBuild(client, { baseRevision: 0, operationId: 'stable-operation', parcelId, worldId })
    const retryAck = await nextMessage(
      client,
      (message) =>
        message.type === 'parcel-build-nodes-ack' &&
        message.operationId === 'stable-operation',
    )
    assert.equal(retryAck.revision, 1)
  } finally {
    client.socket.close()
    server.kill()
  }
})

function sendBuild(
  client,
  {
    baseRevision,
    nodeId = 'wall_revision-test',
    nodes = undefined,
    operationId,
    parcelId,
    schemaVersion = PARCEL_BUILD_SCHEMA_VERSION,
    worldId,
  },
) {
  client.socket.send(
    JSON.stringify({
      baseRevision,
      nodes: nodes ?? [createWall(nodeId)],
      operationId,
      parcelId,
      schemaVersion,
      type: 'sync-parcel-build-nodes',
      worldId,
      writerEpoch: client.writerEpoch,
      writerSessionId: client.writerSessionId,
    }),
  )
}

function createDeepBuildMessage(client, parcelId, worldId) {
  const nestedValue = `${'['.repeat(10_000)}0${']'.repeat(10_000)}`
  const node = `{"children":[],"id":"deep-node","object":"node","parentId":null,"payload":${nestedValue},"type":"wall","visible":true}`
  return `{"baseRevision":3,"nodes":[${node}],"operationId":"deep-build-operation","parcelId":"${parcelId}","schemaVersion":${PARCEL_BUILD_SCHEMA_VERSION},"type":"sync-parcel-build-nodes","worldId":"${worldId}","writerEpoch":${client.writerEpoch},"writerSessionId":"${client.writerSessionId}"}`
}

function createWall(id) {
  return {
    children: [],
    end: [2, 0],
    height: 2.5,
    id,
    object: 'node',
    parentId: null,
    start: [0, 0],
    thickness: 0.2,
    type: 'wall',
    visible: true,
  }
}

function createCanonicalParcelGraph() {
  return [
    createGraphNode('building-parcel', 'building', null, ['level-ground']),
    createGraphNode('level-ground', 'level', 'building-parcel', [
      'duct-main',
      'plugin-extension',
      'slab-ground',
      'spawn-main',
      'stair-main',
      'wall-main',
    ]),
    createGraphNode('spawn-main', 'spawn', 'level-ground'),
    createGraphNode('duct-main', 'duct-segment', 'level-ground'),
    createGraphNode('plugin-extension', 'plugin:adaptive-facade', 'level-ground'),
    createGraphNode('wall-main', 'wall', 'level-ground', ['door-main']),
    createGraphNode('door-main', 'door', 'wall-main'),
    createGraphNode('slab-ground', 'slab', 'level-ground'),
    createGraphNode('stair-main', 'stair', 'level-ground', ['stair-segment-main']),
    createGraphNode('stair-segment-main', 'stair-segment', 'stair-main'),
  ]
}

function createGraphNode(id, type, parentId, children) {
  return {
    ...(children ? { children } : {}),
    id,
    object: 'node',
    parentId,
    type,
    visible: true,
  }
}

async function connectPlayer(
  port,
  id,
  writerSessionId = `writer-${id}`,
  writerEpoch = undefined,
) {
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
      writerEpoch,
      writerSessionId,
    }),
  )
  const writerGrant = await nextMessage(
    { messages, socket },
    (message) => message.type === 'parcel-writer-session-granted',
  )
  await nextMessage({ messages, socket }, (message) => message.type === 'snapshot')
  return { messages, socket, writerEpoch: writerGrant.writerEpoch, writerSessionId }
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
