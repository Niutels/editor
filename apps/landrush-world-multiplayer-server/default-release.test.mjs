import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

test('normal release installs unchanged manifests with npm --omit=dev and starts without the game bundle', { timeout: 45_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'landrush-default-release-'))
  const serverDirectory = join(directory, 'apps', 'landrush-world-multiplayer-server')
  let installer
  let child
  try {
    const packageJson = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'))
    assert.deepEqual(Object.keys(packageJson.dependencies).sort(), ['@landrush/protocol', 'ws'])
    await mkdir(serverDirectory, { recursive: true })
    await mkdir(join(directory, 'packages'), { recursive: true })
    await writeFile(join(directory, 'package.json'), JSON.stringify({
      private: true,
      workspaces: ['apps/landrush-world-multiplayer-server', 'packages/landrush-protocol'],
    }))
    await Promise.all([
      cp(new URL('./package.json', import.meta.url), join(serverDirectory, 'package.json')),
      cp(new URL('./server.mjs', import.meta.url), join(serverDirectory, 'server.mjs')),
      cp(new URL('./network-policy.mjs', import.meta.url), join(serverDirectory, 'network-policy.mjs')),
      cp(dirname(dirname(fileURLToPath(import.meta.resolve('@landrush/protocol')))), join(directory, 'packages', 'landrush-protocol'), { recursive: true }),
    ])
    installer = spawn(process.execPath, [await resolveNpmCli(), 'install', '--omit=dev'], {
      cwd: directory,
      env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false', npm_config_fetch_retries: '0', npm_config_fetch_timeout: '15000' },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 30_000,
    })
    let installOutput = ''
    installer.stdout.on('data', data => { installOutput += data })
    installer.stderr.on('data', data => { installOutput += data })
    const [installCode] = await once(installer, 'exit')
    assert.equal(installCode, 0, `The restricted two-workspace npm install failed: ${installOutput}`)
    assert.equal(await readFile(join(serverDirectory, 'package.json'), 'utf8'), await readFile(new URL('./package.json', import.meta.url), 'utf8'), 'the release must not strip or rewrite the server manifest')
    const reservation = net.createServer()
    reservation.listen(0, '127.0.0.1')
    await once(reservation, 'listening')
    const port = reservation.address().port
    await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()))
    const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('LANDRUSH_')))
    child = spawn(process.execPath, ['server.mjs'], {
      cwd: serverDirectory,
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
    if (installer && installer.exitCode === null && installer.signalCode === null) {
      const exited = once(installer, 'exit')
      installer.kill()
      await exited
    }
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
    await rm(directory, { recursive: true, force: true })
  }
})

async function resolveNpmCli() {
  const candidates = [
    process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ...(process.env.PATH ?? '').split(delimiter).map(directory => join(directory, process.platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : 'npm')),
  ]
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const resolved = await realpath(candidate)
      if (resolved.endsWith('npm-cli.js')) return resolved
    } catch {}
  }
  throw new Error('npm CLI is required to validate the restricted release install')
}
