import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { createZombieGameWorldCompiler } from './dist/zombie-game-server.mjs'

const manifest = JSON.parse(await readFile(new URL('./dist/zombie-game-world.json', import.meta.url), 'utf8'))
const input = (roomId, generation = 1) => ({ roomId, generation, worldId: manifest.worldId, builds: [], sessionId: 'worker-test', night: 0, doorStates: new Map() })

test('real world compilation runs off-thread and retains only the newest queued revision per room', async () => {
  const compiler = createZombieGameWorldCompiler()
  let heartbeatCount = 0
  const heartbeat = setInterval(() => { heartbeatCount += 1 }, 5)
  try {
    const first = compiler.compile(input('one', 1)).then(() => 'accepted', error => error.message)
    const second = compiler.compile(input('one', 2)).then(() => 'accepted', error => error.message)
    const newest = compiler.compile(input('one', 3))
    const other = compiler.compile(input('two'))
    assert.equal(compiler.metrics().active, 1)
    assert.equal(compiler.metrics().queued, 2)
    assert.equal(compiler.metrics().supersededCount, 2)
    assert.match(await first, /superseded/)
    assert.match(await second, /superseded/)
    const [world, otherWorld] = await Promise.all([newest, other])
    assert.match(world.worldSignature, /:3:/)
    assert.ok(otherWorld.navigation.navigationGraph.x.length > 0)
    assert.ok(heartbeatCount >= 5, 'main-thread heartbeats must continue during geometry compilation')
    assert.ok(compiler.metrics().lastHydrateMs < 5)
    assert.ok(compiler.metrics().lastCompileMs > 0)
    assert.equal(compiler.metrics().queued, 0)
    assert.equal(compiler.metrics().active, 0)
  } finally { clearInterval(heartbeat); compiler.dispose() }
})

test('worker failure, timeout, cancellation, and room overflow fail closed without local compilation', async () => {
  const missing = createZombieGameWorldCompiler({ workerUrl: new URL('./does-not-exist.mjs', import.meta.url) })
  try { await assert.rejects(missing.compile(input('missing')), /Cannot find module|not found/) } finally { missing.dispose() }
  const blocked = createZombieGameWorldCompiler({
    timeoutMs: 50, maxRooms: 1,
    workerUrl: new URL('data:text/javascript,import%20%7BparentPort%7D%20from%20%22node%3Aworker_threads%22%3BparentPort.on(%22message%22%2C()%3D%3E%7B%7D)'),
  })
  try {
    const timedOut = blocked.compile(input('blocked'))
    await assert.rejects(blocked.compile(input('overflow')), /capacity/)
    await assert.rejects(timedOut, /timed out/)
    assert.equal(blocked.metrics().compileCount, 0)
    const cancelled = blocked.compile(input('cancelled'))
    blocked.cancel('cancelled')
    await assert.rejects(cancelled, /cancelled/)
    assert.equal(blocked.metrics().active, 0)
  } finally { blocked.dispose() }
  await assert.rejects(blocked.compile(input('closed')), /closed/)
})
