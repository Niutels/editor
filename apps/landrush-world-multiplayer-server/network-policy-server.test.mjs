import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { WebSocket } from 'ws'

const WS_PATH = '/api/landrush-lab/world-multiplayer/ws'
const ORIGIN = 'https://landrush.niutgames.com'

test('normal clients still join, exchange state, and start the Zombie clock without an Origin setting', async (t) => {
  const server = await startServer(t)
  const client = await connect(t, server)
  const initial = await join(client)
  assert.equal(initial.zombieEscapeState.phase, 'build')
  client.socket.send(JSON.stringify({
    type: 'start-zombie-escape-night',
    sessionId: initial.zombieEscapeState.sessionId,
    baseRevision: initial.zombieEscapeState.revision,
  }))
  const night = await waitMessage(client, 'zombie-escape-state-updated')
  assert.equal(night.state.phase, 'night')
  assert.equal(night.state.night, 1)
  client.socket.send(JSON.stringify({ type: 'configure-zombie-authority-experiment', sessionId: initial.zombieEscapeState.sessionId, baseRevision: 0, config: {} }))
  assert.equal((await waitMessage(client, 'error')).code, 'bad-message')
})

test('configured origin gate rejects missing and wrong origins before WebSocket upgrade', async (t) => {
  const server = await startServer(t, { ALLOWED_ORIGINS: ORIGIN })
  for (const origin of [undefined, 'null', `${ORIGIN}.invalid`, 'http://landrush.niutgames.com']) {
    assert.equal(await rejectedUpgrade(server, origin), 403)
  }
  const client = await connect(t, server, ORIGIN)
  assert.equal((await join(client)).type, 'snapshot')
})

test('connection capacity is global and is returned when a socket closes', async (t) => {
  const server = await startServer(t, { MAX_CONNECTIONS: '1' })
  const client = await connect(t, server)
  assert.equal(await rejectedUpgrade(server), 503)
  const closed = once(client.socket, 'close')
  client.socket.close()
  await closed
  await delay(20)
  const replacement = await connect(t, server)
  assert.equal((await join(replacement)).type, 'snapshot')
})

test('per-socket message budget closes flooding clients without affecting a healthy client', async (t) => {
  const server = await startServer(t, { MESSAGES_PER_SECOND: '1', MESSAGE_BURST: '3' })
  const flooding = await connect(t, server)
  const healthy = await connect(t, server)
  const closed = once(flooding.socket, 'close')
  for (let index = 0; index < 5; index += 1) flooding.socket.send('{')
  assert.equal((await closed)[0], 1008)
  assert.equal((await join(healthy)).type, 'snapshot')
})

test('byte budget rejects an oversized malformed message before it can generate parser errors', async (t) => {
  const server = await startServer(t, { BYTES_PER_SECOND: '1', BYTE_BURST: '64' })
  const client = await connect(t, server)
  const closed = once(client.socket, 'close')
  client.socket.send('{'.repeat(65))
  assert.equal((await closed)[0], 1008)
  assert.equal(client.messages.some((message) => message.type === 'error'), false)
})

test('heartbeat cannot extend the prejoin deadline', async (t) => {
  const server = await startServer(t, { PREJOIN_TIMEOUT_MS: '200' })
  const client = await connect(t, server)
  const heartbeat = setInterval(() => {
    if (client.socket.readyState === WebSocket.OPEN) client.socket.send('{"type":"heartbeat"}')
  }, 20)
  t.after(() => clearInterval(heartbeat))
  const [code, reason] = await once(client.socket, 'close')
  assert.equal(code, 1008)
  assert.equal(reason.toString(), 'Join timeout')
})

test('joining or watching clears the deadline and leaving starts a new one', async (t) => {
  const server = await startServer(t, { PREJOIN_TIMEOUT_MS: '200' })
  const joined = await connect(t, server)
  await join(joined)
  const watcher = await connect(t, server)
  watcher.socket.send('{"type":"watch","roomId":"network-policy-test"}')
  await waitMessage(watcher, 'snapshot')
  const subscriber = await connect(t, server)
  subscriber.socket.send('{"type":"watch-parcels","worldId":"network-policy-test"}')
  await waitMessage(subscriber, 'parcel-build-nodes-snapshot')
  await delay(300)
  for (const client of [joined, watcher, subscriber]) assert.equal(client.socket.readyState, WebSocket.OPEN)
  const closed = once(joined.socket, 'close')
  joined.socket.send('{"type":"leave"}')
  assert.equal((await closed)[0], 1008)
})

async function startServer(t, settings = {}) {
  const reservation = net.createServer()
  reservation.listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = reservation.address().port
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()))
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('LANDRUSH_')))
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...environment,
      NODE_ENV: 'test',
      PORT: String(port),
      LANDRUSH_WORLD_MULTIPLAYER_HOST: '127.0.0.1',
      LANDRUSH_WORLD_MULTIPLAYER_STATE_FILE: 'off',
      ...Object.fromEntries(Object.entries(settings).map(([key, value]) => [`LANDRUSH_WORLD_MULTIPLAYER_${key}`, value])),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let output = ''
  child.stdout.on('data', (data) => { output += data })
  child.stderr.on('data', (data) => { output += data })
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, 'exit')
    child.kill()
    await exited
  })
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(output)
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return { port }
    } catch {}
    await delay(30)
  }
  throw new Error(`Server failed to start: ${output}`)
}

async function connect(t, server, origin) {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}${WS_PATH}`, { origin })
  const client = { socket, messages: [] }
  socket.on('message', (data) => client.messages.push(JSON.parse(data.toString())))
  t.after(() => socket.terminate())
  await once(socket, 'open')
  await waitMessage(client, 'welcome')
  return client
}

async function rejectedUpgrade(server, origin) {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}${WS_PATH}`, { origin })
  socket.on('error', () => {})
  const [, response] = await once(socket, 'unexpected-response')
  response.resume()
  socket.terminate()
  return response.statusCode
}

async function join(client) {
  client.socket.send(JSON.stringify({
    type: 'join',
    gameMode: 'zombie-escape',
    roomId: 'network-policy-test',
    writerSessionId: 'network-policy-writer',
    player: { id: 'network-policy-player', name: 'Test', color: '#7dd3fc', position: [0, 0, 0] },
  }))
  return await waitMessage(client, 'snapshot')
}

async function waitMessage(client, type) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const index = client.messages.findIndex((message) => message.type === type)
    if (index >= 0) return client.messages.splice(index, 1)[0]
    if (client.socket.readyState !== WebSocket.OPEN) throw new Error(`Socket closed before ${type}`)
    await delay(10)
  }
  throw new Error(`Timed out waiting for ${type}`)
}
