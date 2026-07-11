import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import { after, test } from 'node:test'
import { WebSocket } from 'ws'

const WS_PATH = '/api/landrush-lab/world-multiplayer/ws'
const children = new Set()

after(() => {
  for (const child of children) child.kill()
})

test('routes spatial voice WebRTC signals between joined room peers both ways', async () => {
  const port = await getOpenPort()
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      LANDRUSH_WORLD_MULTIPLAYER_WS_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(server)
  server.on('exit', () => children.delete(server))

  await waitForServer(port)

  const alice = await connectPlayer(port, 'alice')
  const bob = await connectPlayer(port, 'bob')

  try {
    await nextMessage(alice, (message) => message.type === 'player-joined')

    alice.socket.send(
      JSON.stringify({
        signal: {
          description: { sdp: 'v=0\r\ns=alice-offer\r\n', type: 'offer' },
          type: 'description',
        },
        to: 'bob',
        type: 'voice-signal',
      }),
    )
    const bobOffer = await nextMessage(bob, (message) => message.type === 'voice-signal')
    assert.equal(bobOffer.from, 'alice')
    assert.equal(bobOffer.signal.type, 'description')
    assert.equal(bobOffer.signal.description.type, 'offer')

    bob.socket.send(
      JSON.stringify({
        signal: {
          candidate: { candidate: 'candidate:1 1 udp 1 127.0.0.1 9 typ host', sdpMLineIndex: 0 },
          type: 'ice-candidate',
        },
        to: 'alice',
        type: 'voice-signal',
      }),
    )
    const aliceCandidate = await nextMessage(alice, (message) => message.type === 'voice-signal')
    assert.equal(aliceCandidate.from, 'bob')
    assert.equal(aliceCandidate.signal.type, 'ice-candidate')
    assert.match(String(aliceCandidate.signal.candidate.candidate), /^candidate:/)
  } finally {
    alice.socket.close()
    bob.socket.close()
    server.kill()
  }
})

async function connectPlayer(port, id) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`)
  const messages = []
  socket.on('message', (data) => {
    messages.push(JSON.parse(data.toString()))
  })
  await once(socket, 'open')
  await nextMessage({ messages, socket }, (message) => message.type === 'welcome')
  socket.send(
    JSON.stringify({
      player: {
        color: id === 'alice' ? '#7dd3fc' : '#facc15',
        heading: 0,
        id,
        moving: false,
        name: id,
        position: [id === 'alice' ? 0 : 3, 0, 0],
        speed: 0,
        updatedAt: Date.now(),
      },
      roomId: 'voice-test',
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
