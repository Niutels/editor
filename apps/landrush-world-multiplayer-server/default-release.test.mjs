import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

test('normal release starts with only ws and protocol, without a game bundle or build dependencies', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'landrush-default-release-'))
  let child
  try {
    const packageJson = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'))
    assert.deepEqual(Object.keys(packageJson.dependencies).sort(), ['@landrush/protocol', 'ws'])
    await mkdir(join(directory, 'node_modules', '@landrush'), { recursive: true })
    await Promise.all([
      cp(new URL('./server.mjs', import.meta.url), join(directory, 'server.mjs')),
      cp(new URL('./network-policy.mjs', import.meta.url), join(directory, 'network-policy.mjs')),
      cp(dirname(dirname(fileURLToPath(import.meta.resolve('@landrush/protocol')))), join(directory, 'node_modules', '@landrush', 'protocol'), { recursive: true }),
      cp(dirname(fileURLToPath(import.meta.resolve('ws'))), join(directory, 'node_modules', 'ws'), { recursive: true }),
    ])
    const reservation = net.createServer()
    reservation.listen(0, '127.0.0.1')
    await once(reservation, 'listening')
    const port = reservation.address().port
    await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()))
    const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('LANDRUSH_')))
    child = spawn(process.execPath, ['server.mjs'], {
      cwd: directory,
      env: { ...environment, NODE_ENV: 'test', PORT: String(port), LANDRUSH_WORLD_MULTIPLAYER_HOST: '127.0.0.1', LANDRUSH_WORLD_MULTIPLAYER_STATE_FILE: 'off' },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    })
    let output = ''
    child.stdout.on('data', data => { output += data })
    child.stderr.on('data', data => { output += data })
    for (let attempt = 0; attempt < 200; attempt += 1) {
      assert.equal(child.exitCode, null, output)
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`)
        if (response.ok) {
          assert.equal((await response.json()).ok, true)
          return
        }
      } catch {}
      await delay(25)
    }
    assert.fail(`Default release did not start: ${output}`)
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
    await rm(directory, { recursive: true, force: true })
  }
})
