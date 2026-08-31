import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import { after, test } from 'node:test'
import { WebSocket } from 'ws'

const WS_PATH = '/api/landrush-lab/world-multiplayer/ws'
const ZOMBIE_ESCAPE_GAME_MODE = 'zombie-escape'
const NIGHT_DURATION_MS = 180_000
const children = new Set()

after(() => {
  for (const child of children) child.kill()
})

test('holds build for manual start, enforces CAS and participant authority, and hydrates late joins', async () => {
  const { port, server } = await startServer()
  const roomId = 'zombie-escape-clock-room'
  const clients = []
  try {
    const normal = await connectPlayer(port, 'normal-player', roomId)
    clients.push(normal)
    assert.equal(normal.snapshot.zombieEscapeState, undefined)

    const zombie = await connectPlayer(port, 'zombie-player', roomId, {
      gameMode: ZOMBIE_ESCAPE_GAME_MODE,
    })
    clients.push(zombie)
    const held = zombie.snapshot.zombieEscapeState
    assertZombieEscapeState(held, {
      night: 0,
      phase: 'build',
      phaseEndsAt: null,
      revision: 0,
    })

    zombie.socket.send(
      JSON.stringify({
        baseRevision: held.revision + 1,
        sessionId: held.sessionId,
        type: 'start-zombie-escape-night',
      }),
    )
    const startConflict = await nextMessage(
      zombie,
      (message) => message.type === 'zombie-escape-state-rejected',
    )
    assert.equal(startConflict.code, 'zombie-escape-state-conflict')
    assert.deepEqual(startConflict.state, held)

    normal.socket.send(
      JSON.stringify({
        baseRevision: held.revision,
        sessionId: held.sessionId,
        type: 'start-zombie-escape-night',
      }),
    )
    const normalStartRejection = await nextMessage(
      normal,
      (message) => message.type === 'zombie-escape-state-rejected',
    )
    assert.equal(normalStartRejection.code, 'not-zombie-escape-participant')
    assert.deepEqual(normalStartRejection.state, held)

    zombie.socket.send(
      JSON.stringify({
        baseRevision: held.revision,
        sessionId: held.sessionId,
        type: 'start-zombie-escape-night',
      }),
    )
    const nightMessage = await nextMessage(
      zombie,
      (message) =>
        message.type === 'zombie-escape-state-updated' && message.state?.phase === 'night',
    )
    const night = nightMessage.state
    assertZombieEscapeState(night, {
      night: 1,
      phase: 'night',
      revision: 1,
      sessionId: held.sessionId,
    })
    assertDeadline(nightMessage, night, NIGHT_DURATION_MS)

    zombie.socket.send(
      JSON.stringify({
        baseRevision: night.revision,
        sessionId: night.sessionId,
        type: 'start-zombie-escape-night',
      }),
    )
    const activeNightRejection = await nextMessage(
      zombie,
      (message) => message.type === 'zombie-escape-state-rejected',
    )
    assert.equal(activeNightRejection.code, 'zombie-escape-night-active')
    assert.deepEqual(activeNightRejection.state, night)

    const lateZombie = await connectPlayer(port, 'late-zombie-player', roomId, {
      gameMode: ZOMBIE_ESCAPE_GAME_MODE,
    })
    clients.push(lateZombie)
    assert.deepEqual(lateZombie.snapshot.zombieEscapeState, night)
    assert.ok(lateZombie.snapshot.serverTime <= night.phaseEndsAt)
    assert.ok(night.phaseEndsAt - lateZombie.snapshot.serverTime <= NIGHT_DURATION_MS)
  } finally {
    for (const client of clients) client.socket.close()
    server.kill()
  }
})

test('clears the Zombie clock when the last Zombie leaves even if a normal peer remains', async () => {
  const { port, server } = await startServer()
  const roomId = 'zombie-escape-cleanup-room'
  const clients = []
  try {
    const normal = await connectPlayer(port, 'normal-anchor', roomId)
    clients.push(normal)
    const zombie = await connectPlayer(port, 'departing-zombie', roomId, {
      gameMode: ZOMBIE_ESCAPE_GAME_MODE,
    })
    clients.push(zombie)
    const held = zombie.snapshot.zombieEscapeState
    zombie.socket.send(
      JSON.stringify({
        baseRevision: held.revision,
        sessionId: held.sessionId,
        type: 'start-zombie-escape-night',
      }),
    )
    await nextMessage(
      zombie,
      (message) =>
        message.type === 'zombie-escape-state-updated' && message.state?.phase === 'night',
    )

    const zombieClosed = once(zombie.socket, 'close')
    zombie.socket.close()
    await zombieClosed
    await nextMessage(
      normal,
      (message) => message.type === 'player-left' && message.id === 'departing-zombie',
    )

    const observer = await connectWatcher(port, roomId)
    clients.push(observer)
    assert.equal(observer.snapshot.zombieEscapeState, undefined)

    const nextZombie = await connectPlayer(port, 'next-zombie', roomId, {
      gameMode: ZOMBIE_ESCAPE_GAME_MODE,
    })
    clients.push(nextZombie)
    const nextHeld = nextZombie.snapshot.zombieEscapeState
    assertZombieEscapeState(nextHeld, {
      night: 0,
      phase: 'build',
      phaseEndsAt: null,
      revision: 0,
    })
    assert.notEqual(nextHeld.sessionId, held.sessionId)
  } finally {
    for (const client of clients) client.socket.close()
    server.kill()
  }
})

test('same-ID replacement preserves or clears Zombie participation according to the new peer', async () => {
  const { port, server } = await startServer()
  const roomId = 'zombie-escape-replacement-room'
  const clients = []
  try {
    const observer = await connectPlayer(port, 'replacement-observer', roomId)
    clients.push(observer)
    const first = await connectPlayer(port, 'replaceable-player', roomId, {
      gameMode: ZOMBIE_ESCAPE_GAME_MODE,
      writerSessionId: 'replaceable-zombie-a',
    })
    clients.push(first)
    const held = first.snapshot.zombieEscapeState
    first.socket.send(
      JSON.stringify({
        baseRevision: held.revision,
        sessionId: held.sessionId,
        type: 'start-zombie-escape-night',
      }),
    )
    const nightMessage = await nextMessage(
      first,
      (message) =>
        message.type === 'zombie-escape-state-updated' && message.state?.phase === 'night',
    )
    const night = nightMessage.state

    const firstClosed = once(first.socket, 'close')
    const zombieReplacement = await connectPlayer(port, 'replaceable-player', roomId, {
      gameMode: ZOMBIE_ESCAPE_GAME_MODE,
      writerSessionId: 'replaceable-zombie-b',
    })
    clients.push(zombieReplacement)
    await firstClosed
    assert.deepEqual(zombieReplacement.snapshot.zombieEscapeState, night)

    const replacementClosed = once(zombieReplacement.socket, 'close')
    const normalReplacement = await connectPlayer(port, 'replaceable-player', roomId, {
      writerSessionId: 'replaceable-normal-c',
    })
    clients.push(normalReplacement)
    await replacementClosed
    assert.equal(normalReplacement.snapshot.zombieEscapeState, undefined)

    const watcher = await connectWatcher(port, roomId)
    clients.push(watcher)
    assert.equal(watcher.snapshot.zombieEscapeState, undefined)
  } finally {
    for (const client of clients) client.socket.close()
    server.kill()
  }
})

test('cross-room same-ID takeover clears a superseded Zombie clock during close grace', async () => {
  const { port, server } = await startServer({ LANDRUSH_WRITER_SESSION_CLOSE_GRACE_MS: '5000' })
  const oldRoomId = 'zombie-escape-cross-room-old'
  const newRoomId = 'zombie-escape-cross-room-new'
  const clients = []
  try {
    const observer = await connectPlayer(port, 'cross-room-observer', oldRoomId)
    clients.push(observer)
    const first = await connectPlayer(port, 'cross-room-player', oldRoomId, {
      gameMode: ZOMBIE_ESCAPE_GAME_MODE,
      writerSessionId: 'cross-room-zombie-a',
    })
    clients.push(first)
    const held = first.snapshot.zombieEscapeState
    first.socket.send(
      JSON.stringify({
        baseRevision: held.revision,
        sessionId: held.sessionId,
        type: 'start-zombie-escape-night',
      }),
    )
    const nightMessage = await nextMessage(
      first,
      (message) =>
        message.type === 'zombie-escape-state-updated' && message.state?.phase === 'night',
    )

    const replacement = await connectPlayer(port, 'cross-room-player', newRoomId, {
      writerSessionId: 'cross-room-normal-b',
    })
    clients.push(replacement)
    assert.equal(first.socket.readyState, WebSocket.OPEN)

    const nextZombie = await connectPlayer(port, 'cross-room-next-zombie', oldRoomId, {
      gameMode: ZOMBIE_ESCAPE_GAME_MODE,
    })
    clients.push(nextZombie)
    const nextHeld = nextZombie.snapshot.zombieEscapeState
    assertZombieEscapeState(nextHeld, {
      night: 0,
      phase: 'build',
      phaseEndsAt: null,
      revision: 0,
    })
    assert.notEqual(nextHeld.sessionId, nightMessage.state.sessionId)
  } finally {
    for (const client of clients) client.socket.close()
    server.kill()
  }
})

function assertZombieEscapeState(
  state,
  { night, phase, phaseEndsAt = undefined, revision, sessionId = undefined },
) {
  assert.ok(state)
  assert.equal(typeof state.sessionId, 'string')
  assert.ok(state.sessionId.length > 0)
  if (sessionId !== undefined) assert.equal(state.sessionId, sessionId)
  assert.equal(state.revision, revision)
  assert.equal(state.phase, phase)
  assert.equal(state.night, night)
  if (phaseEndsAt !== undefined) assert.equal(state.phaseEndsAt, phaseEndsAt)
  else assert.equal(typeof state.phaseEndsAt, 'number')
}

function assertDeadline(message, state, durationMs) {
  assert.equal(typeof message.serverTime, 'number')
  assert.equal(typeof state.phaseEndsAt, 'number')
  const remainingMs = state.phaseEndsAt - message.serverTime
  assert.ok(
    remainingMs >= durationMs - 100,
    `expected at least ${durationMs - 100}ms, got ${remainingMs}ms`,
  )
  assert.ok(
    remainingMs <= durationMs + 100,
    `expected at most ${durationMs + 100}ms, got ${remainingMs}ms`,
  )
}

async function startServer(environment = {}) {
  const port = await getOpenPort()
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      ...environment,
      LANDRUSH_WORLD_MULTIPLAYER_STATE_FILE: 'off',
      LANDRUSH_WORLD_MULTIPLAYER_WS_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(server)
  server.on('exit', () => children.delete(server))
  await waitForServer(port)
  return { port, server }
}

async function connectPlayer(port, id, roomId, options = {}) {
  const client = await openClient(port)
  const writerSessionId = options.writerSessionId ?? `writer-${id}`
  client.socket.send(
    JSON.stringify({
      ...(options.gameMode ? { gameMode: options.gameMode } : {}),
      player: createPlayer(id),
      roomId,
      type: 'join',
      writerSessionId,
    }),
  )
  const grant = await nextMessage(
    client,
    (message) => message.type === 'parcel-writer-session-granted',
  )
  const snapshot = await nextMessage(
    client,
    (message) => message.type === 'snapshot' && message.roomId === roomId,
  )
  return { ...client, snapshot, writerEpoch: grant.writerEpoch, writerSessionId }
}

async function connectWatcher(port, roomId) {
  const client = await openClient(port)
  client.socket.send(JSON.stringify({ roomId, type: 'watch' }))
  const snapshot = await nextMessage(
    client,
    (message) => message.type === 'snapshot' && message.roomId === roomId,
  )
  return { ...client, snapshot }
}

async function openClient(port) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`)
  const messages = []
  const waiters = new Set()
  socket.on('message', (data) => {
    messages.push(JSON.parse(data.toString()))
    for (const waiter of waiters) waiter()
  })
  await once(socket, 'open')
  const client = { messages, socket, waiters }
  await nextMessage(client, (message) => message.type === 'welcome')
  return client
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
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Timed out waiting for WebSocket message'))
    }, 3000)
    const handleMessages = () => {
      const index = client.messages.findIndex(predicate)
      if (index < 0) return
      const [message] = client.messages.splice(index, 1)
      cleanup()
      resolve(message)
    }
    const handleClose = () => {
      cleanup()
      reject(new Error('WebSocket closed before expected message'))
    }
    const cleanup = () => {
      clearTimeout(timeout)
      client.waiters.delete(handleMessages)
      client.socket.off('close', handleClose)
    }
    client.waiters.add(handleMessages)
    client.socket.on('close', handleClose)
    handleMessages()
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
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return port
}
