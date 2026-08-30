import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import { after, test } from 'node:test'
import {
  PARCEL_BUILD_SCHEMA_VERSION,
  PARCEL_WRITER_SESSION_CLOSE_CODE,
} from '@landrush/protocol'
import { WebSocket } from 'ws'

const WS_PATH = '/api/landrush-lab/world-multiplayer/ws'
const children = new Set()

after(() => {
  for (const child of children) child.kill()
})

test('fences a displaced editor session and rejects its later reconnect', async () => {
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

  const first = await connectPlayer(port, 'shared-builder', 'writer-tab-a')
  const firstClosed = once(first.socket, 'close')
  const worldId = 'writer-session-world'
  const parcelId = 'parcel-1'
  try {
    first.socket.send(JSON.stringify({ parcelId, type: 'claim-parcel', worldId }))
    await nextMessage(first, (message) => message.type === 'parcel-claim-result')

    const second = await connectPlayer(port, 'shared-builder', 'writer-tab-b')
    try {
      const [closeCode] = await firstClosed
      assert.equal(closeCode, PARCEL_WRITER_SESSION_CLOSE_CODE)
      assert.equal(second.writerEpoch, first.writerEpoch + 1)

      const roomCountBeforeRejection = (await readMetrics(port)).rooms
      const displaced = await connectRejected(
        port,
        'shared-builder',
        'writer-tab-a',
        first.writerEpoch,
        'rejected-writer-room',
      )
      assert.equal(displaced.rejection.code, 'writer-session-superseded')
      assert.equal(displaced.closeCode, PARCEL_WRITER_SESSION_CLOSE_CODE)
      assert.equal((await readMetrics(port)).rooms, roomCountBeforeRejection)

      await setProfileMoneyBalance(second, 20)
      sendBuild(second, 0, 'writer-tab-b-operation', parcelId, worldId)
      const ack = await nextMessage(
        second,
        (message) => message.type === 'parcel-build-nodes-ack',
      )
      assert.equal(ack.operationId, 'writer-tab-b-operation')
      assert.equal(ack.revision, 1)

      second.socket.send(
        JSON.stringify(
          createJoin(
            'shared-builder',
            second.writerSessionId,
            second.writerEpoch,
            'writer-session-room-change',
          ),
        ),
      )
      const roomChangeGrant = await nextMessage(
        second,
        (message) =>
          message.type === 'parcel-writer-session-granted' &&
          message.roomId === 'writer-session-room-change',
      )
      await nextMessage(
        second,
        (message) =>
          message.type === 'snapshot' && message.roomId === 'writer-session-room-change',
      )
      assert.equal(roomChangeGrant.writerEpoch, second.writerEpoch)
      sendBuild(second, 1, 'room-change-operation', parcelId, worldId)
      const roomChangeAck = await nextMessage(
        second,
        (message) =>
          message.type === 'parcel-build-nodes-ack' &&
          message.operationId === 'room-change-operation',
      )
      assert.equal(roomChangeAck.revision, 2)

      const secondClosed = once(second.socket, 'close')
      const replacement = await connectPlayer(
        port,
        'shared-builder',
        second.writerSessionId,
        second.writerEpoch,
        'writer-session-room-change',
      )
      try {
        const [replacementCloseCode] = await secondClosed
        assert.equal(replacementCloseCode, PARCEL_WRITER_SESSION_CLOSE_CODE)
        assert.equal(replacement.writerEpoch, second.writerEpoch)
        sendBuild(replacement, 2, 'overlap-reconnect-operation', parcelId, worldId)
        const replacementAck = await nextMessage(
          replacement,
          (message) =>
            message.type === 'parcel-build-nodes-ack' &&
            message.operationId === 'overlap-reconnect-operation',
        )
        assert.equal(replacementAck.revision, 3)
      } finally {
        replacement.socket.close()
      }
    } finally {
      second.socket.close()
    }
  } finally {
    first.socket.close()
    server.kill()
  }
})

test('fences every stale peer mutation during the takeover close race', async () => {
  const port = await getOpenPort()
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      LANDRUSH_WORLD_MULTIPLAYER_STATE_FILE: 'off',
      LANDRUSH_WORLD_MULTIPLAYER_WS_PORT: String(port),
      LANDRUSH_WRITER_SESSION_CLOSE_GRACE_MS: '1000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(server)
  server.on('exit', () => children.delete(server))
  await waitForServer(port)

  const roomId = 'writer-close-race'
  const clients = []
  try {
    const staleJoin = await connectPlayer(port, 'stale-join-player', 'stale-join-a', undefined, roomId)
    clients.push(staleJoin)
    const joinWinner = await connectPlayer(
      port,
      'stale-join-player',
      'stale-join-b',
      undefined,
      roomId,
    )
    clients.push(joinWinner)
    await sendAsStale(
      staleJoin,
      createJoin('stale-join-player', 'stale-join-c', undefined, roomId),
    )
    joinWinner.socket.send(
      JSON.stringify({
        parcelId: 'parcel-stale-join',
        type: 'claim-parcel',
        worldId: 'stale-join-world',
      }),
    )
    await nextMessage(joinWinner, (message) => message.type === 'parcel-claim-result')

    const staleClaim = await connectPlayer(
      port,
      'stale-claim-player',
      'stale-claim-a',
      undefined,
      roomId,
    )
    clients.push(staleClaim)
    const claimWinner = await connectPlayer(
      port,
      'stale-claim-player',
      'stale-claim-b',
      undefined,
      roomId,
    )
    clients.push(claimWinner)
    const claimMessage = {
      parcelId: 'parcel-stale-claim',
      type: 'claim-parcel',
      worldId: 'stale-claim-world',
    }
    await sendAsStale(staleClaim, claimMessage)
    claimWinner.socket.send(JSON.stringify(claimMessage))
    await nextMessage(claimWinner, (message) => message.type === 'parcel-claim-result')

    const staleTv = await connectPlayer(port, 'stale-tv-player', 'stale-tv-a', undefined, roomId)
    clients.push(staleTv)
    staleTv.socket.send(
      JSON.stringify({
        parcelId: 'parcel-stale-tv',
        type: 'claim-parcel',
        worldId: 'stale-tv-world',
      }),
    )
    await nextMessage(staleTv, (message) => message.type === 'parcel-claim-result')
    const tvWinner = await connectPlayer(
      port,
      'stale-tv-player',
      'stale-tv-b',
      undefined,
      roomId,
    )
    clients.push(tvWinner)
    const tvMessage = {
      muted: false,
      parcelId: 'parcel-stale-tv',
      playbackSeconds: 0,
      playing: true,
      tvId: 'tv-close-race',
      type: 'sync-tv-media-state',
      url: 'https://example.com/winner',
      userVolume: 0.5,
      worldId: 'stale-tv-world',
    }
    await sendAsStale(staleTv, { ...tvMessage, url: 'https://example.com/stale' })
    tvWinner.socket.send(JSON.stringify(tvMessage))
    const tvResult = await nextMessage(
      tvWinner,
      (message) => message.type === 'tv-media-state-synced',
    )
    assert.equal(tvResult.tv.url, 'https://example.com/winner')

    const stateTarget = await connectPlayer(
      port,
      'state-target',
      'state-target-writer',
      undefined,
      roomId,
    )
    clients.push(stateTarget)
    const staleState = await connectPlayer(
      port,
      'stale-state-player',
      'stale-state-a',
      undefined,
      roomId,
    )
    clients.push(staleState)
    const stateWinner = await connectPlayer(
      port,
      'stale-state-player',
      'stale-state-b',
      undefined,
      roomId,
    )
    clients.push(stateWinner)
    await sendAsStale(staleState, {
      player: { ...createPlayer('stale-state-player'), position: [111, 0, 0] },
      type: 'state',
    })
    stateWinner.socket.send(
      JSON.stringify({
        player: { ...createPlayer('stale-state-player'), position: [222, 0, 0] },
        type: 'state',
      }),
    )
    const stateUpdate = await nextMessage(
      stateTarget,
      (message) => message.type === 'player-state' && message.player.id === 'stale-state-player',
    )
    assert.deepEqual(stateUpdate.player.position, [222, 0, 0])

    const voiceTarget = await connectPlayer(
      port,
      'voice-target',
      'voice-target-writer',
      undefined,
      roomId,
    )
    clients.push(voiceTarget)
    const staleVoice = await connectPlayer(
      port,
      'stale-voice-player',
      'stale-voice-a',
      undefined,
      roomId,
    )
    clients.push(staleVoice)
    const voiceWinner = await connectPlayer(
      port,
      'stale-voice-player',
      'stale-voice-b',
      undefined,
      roomId,
    )
    clients.push(voiceWinner)
    const voiceMessage = {
      signal: {
        description: { sdp: 'v=0\r\ns=winner-offer\r\n', type: 'offer' },
        type: 'description',
      },
      to: 'voice-target',
      type: 'voice-signal',
    }
    await sendAsStale(staleVoice, {
      ...voiceMessage,
      signal: {
        description: { sdp: 'v=0\r\ns=stale-offer\r\n', type: 'offer' },
        type: 'description',
      },
    })
    voiceWinner.socket.send(JSON.stringify(voiceMessage))
    const voiceUpdate = await nextMessage(
      voiceTarget,
      (message) => message.type === 'voice-signal' && message.from === 'stale-voice-player',
    )
    assert.match(voiceUpdate.signal.description.sdp, /winner-offer/)
  } finally {
    for (const client of clients) client.socket.close()
    server.kill()
  }
})

test('bounds inactive writer grants and expires them after the retention horizon', async () => {
  const port = await getOpenPort()
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      LANDRUSH_MAX_INACTIVE_WRITER_SESSIONS: '8',
      LANDRUSH_WORLD_MULTIPLAYER_STATE_FILE: 'off',
      LANDRUSH_WORLD_MULTIPLAYER_WS_PORT: String(port),
      LANDRUSH_WRITER_SESSION_RETENTION_MS: '30',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(server)
  server.on('exit', () => children.delete(server))
  await waitForServer(port)

  try {
    for (let index = 0; index < 24; index += 1) {
      const client = await connectPlayer(port, `retained-${index}`, `writer-retained-${index}`)
      const closed = once(client.socket, 'close')
      client.socket.close()
      await closed
    }
    const bounded = await readMetrics(port)
    assert.equal(bounded.maxInactiveWriterSessions, 8)
    assert.ok(bounded.inactiveWriterSessions <= 8)

    await new Promise((resolve) => setTimeout(resolve, 50))
    const sweepSocket = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`)
    await once(sweepSocket, 'open')
    sweepSocket.send(JSON.stringify({ type: 'heartbeat' }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    const expired = await readMetrics(port)
    assert.equal(expired.inactiveWriterSessions, 0)
    assert.equal(expired.writerSessions, 0)
    sweepSocket.close()
  } finally {
    server.kill()
  }
})

async function connectPlayer(
  port,
  id,
  writerSessionId,
  writerEpoch = undefined,
  roomId = 'writer-session-test',
) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`)
  const messages = []
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())))
  await once(socket, 'open')
  await nextMessage({ messages, socket }, (message) => message.type === 'welcome')
  socket.send(JSON.stringify(createJoin(id, writerSessionId, writerEpoch, roomId)))
  const grant = await nextMessage(
    { messages, socket },
    (message) => message.type === 'parcel-writer-session-granted',
  )
  await nextMessage({ messages, socket }, (message) => message.type === 'snapshot')
  return { messages, socket, writerEpoch: grant.writerEpoch, writerSessionId }
}

async function connectRejected(
  port,
  id,
  writerSessionId,
  writerEpoch,
  roomId = 'writer-session-test',
) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`)
  const messages = []
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())))
  await once(socket, 'open')
  await nextMessage({ messages, socket }, (message) => message.type === 'welcome')
  const closed = once(socket, 'close')
  socket.send(JSON.stringify(createJoin(id, writerSessionId, writerEpoch, roomId)))
  const rejection = await nextMessage(
    { messages, socket },
    (message) => message.type === 'parcel-writer-session-rejected',
  )
  const [closeCode] = await closed
  return { closeCode, rejection }
}

function createJoin(id, writerSessionId, writerEpoch, roomId = 'writer-session-test') {
  return {
    player: createPlayer(id),
    roomId,
    type: 'join',
    writerEpoch,
    writerSessionId,
  }
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

async function sendAsStale(client, message) {
  const closed = once(client.socket, 'close')
  client.socket.send(JSON.stringify(message))
  const [closeCode] = await closed
  const rejection = client.messages.find(
    (candidate) => candidate.type === 'parcel-writer-session-rejected',
  )
  assert.ok(rejection)
  assert.equal(rejection.code, 'writer-session-superseded')
  assert.equal(closeCode, PARCEL_WRITER_SESSION_CLOSE_CODE)
}

function sendBuild(client, baseRevision, operationId, parcelId, worldId) {
  client.socket.send(
    JSON.stringify({
      baseRevision,
      nodes: [
        {
          children: [],
          end: [2, 0],
          id: 'wall-writer-session',
          object: 'node',
          parentId: null,
          start: [0, 0],
          type: 'wall',
          visible: true,
        },
      ],
      operationId,
      parcelId,
      schemaVersion: PARCEL_BUILD_SCHEMA_VERSION,
      type: 'sync-parcel-build-nodes',
      worldId,
      writerEpoch: client.writerEpoch,
      writerSessionId: client.writerSessionId,
    }),
  )
}

async function setProfileMoneyBalance(client, amount) {
  assert.equal(amount % 10, 0)
  let wallet = await nextMessage(client, (message) => message.type === 'profile-money-snapshot')
  if (wallet.wallet.balance > amount) {
    const operationId = `fund-${client.writerSessionId}-debit`
    client.socket.send(
      JSON.stringify({
        operation: {
          baseRevision: wallet.wallet.revision,
          cost: wallet.wallet.balance - amount,
          kind: 'weapon-purchase',
          operationId,
        },
        type: 'apply-profile-money-operation',
        writerEpoch: client.writerEpoch,
        writerSessionId: client.writerSessionId,
      }),
    )
    wallet = await nextMessage(
      client,
      (message) =>
        message.type === 'profile-money-operation-ack' && message.operationId === operationId,
    )
  }
  assert.equal((amount - wallet.wallet.balance) % 10, 0)
  for (let index = wallet.wallet.balance / 10; index < amount / 10; index += 1) {
    const operationId = `fund-${client.writerSessionId}-reward-${index}`
    client.socket.send(
      JSON.stringify({
        operation: {
          baseRevision: wallet.wallet.revision,
          kind: 'zombie-kill-reward',
          operationId,
        },
        type: 'apply-profile-money-operation',
        writerEpoch: client.writerEpoch,
        writerSessionId: client.writerSessionId,
      }),
    )
    wallet = await nextMessage(
      client,
      (message) =>
        message.type === 'profile-money-operation-ack' && message.operationId === operationId,
    )
  }
  assert.equal(wallet.wallet.balance, amount)
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

async function readMetrics(port) {
  const response = await fetch(`http://127.0.0.1:${port}/metrics`)
  assert.equal(response.ok, true)
  return response.json()
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
