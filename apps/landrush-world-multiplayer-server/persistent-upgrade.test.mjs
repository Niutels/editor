import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { after, test } from 'node:test'
import {
  LEGACY_PARCEL_BUILD_SCHEMA_VERSION,
  PARCEL_BUILD_SCHEMA_VERSION,
} from '@landrush/protocol'
import { WebSocket } from 'ws'

const WS_PATH = '/api/landrush-lab/world-multiplayer/ws'
const children = new Set()

after(() => {
  for (const child of children) child.kill()
})

test('keeps and migrates a legacy world across server replacement', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'landrush-persistent-upgrade-'))
  const stateFile = join(dataDirectory, 'world-multiplayer-state.json')
  const worldId = 'persistent-upgrade-world'
  const legacyState = createLegacyState(worldId)
  const encodedLegacyState = `${JSON.stringify(legacyState, null, 2)}\n`
  await writeFile(stateFile, encodedLegacyState, 'utf8')

  let firstServer
  let secondServer
  try {
    firstServer = await startServer(dataDirectory)
    const firstSnapshot = await readParcelSnapshot(firstServer.port, worldId)
    const firstHealth = await readHealth(firstServer.port)

    assert.equal(firstSnapshot.ownerships.length, 1)
    assert.equal(firstSnapshot.builds.length, 1)
    assert.equal(firstSnapshot.builds[0].parcelId, 'parcel-02')
    assert.equal(firstSnapshot.builds[0].revision, 0)
    assert.equal(firstSnapshot.builds[0].schemaVersion, LEGACY_PARCEL_BUILD_SCHEMA_VERSION)
    assert.equal(firstSnapshot.builds[0].operationId, 'restored-parcel-02-0')
    assert.equal(firstSnapshot.builds[0].nodes.length, 1)
    assert.equal(firstHealth.persistence.backupAvailable, true)
    assert.equal(firstHealth.persistence.migrated, true)
    assert.equal(firstHealth.persistence.restored, true)

    await stopServer(firstServer.child)
    firstServer = null

    const migratedState = JSON.parse(await readFile(stateFile, 'utf8'))
    assert.equal(migratedState.schemaVersion, 2)
    assert.equal(migratedState.worlds[0].builds[0].operationId, 'restored-parcel-02-0')
    assert.equal(migratedState.worlds[0].builds[0].revision, 0)
    assert.equal(
      migratedState.worlds[0].builds[0].schemaVersion,
      LEGACY_PARCEL_BUILD_SCHEMA_VERSION,
    )

    const firstBackupFiles = await readdir(join(dataDirectory, 'backups'))
    assert.equal(firstBackupFiles.length, 1)
    assert.deepEqual(
      JSON.parse(await readFile(join(dataDirectory, 'backups', firstBackupFiles[0]), 'utf8')),
      legacyState,
    )

    secondServer = await startServer(dataDirectory)
    const secondSnapshot = await readParcelSnapshot(secondServer.port, worldId)
    const secondHealth = await readHealth(secondServer.port)

    assert.deepEqual(secondSnapshot.ownerships, firstSnapshot.ownerships)
    assert.deepEqual(secondSnapshot.builds, firstSnapshot.builds)
    assert.equal(secondHealth.persistence.backupAvailable, true)
    assert.equal(secondHealth.persistence.migrated, false)
    assert.equal(secondHealth.persistence.restored, true)
  } finally {
    if (firstServer) await stopServer(firstServer.child)
    if (secondServer) await stopServer(secondServer.child)
    await rm(dataDirectory, { force: true, recursive: true })
  }
})

test('refuses an implicit checkout-local save path in production', async () => {
  const port = await getOpenPort()
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      LANDRUSH_WORLD_MULTIPLAYER_DATA_DIR: '',
      LANDRUSH_WORLD_MULTIPLAYER_STATE_FILE: '',
      LANDRUSH_WORLD_MULTIPLAYER_WS_PORT: String(port),
      NODE_ENV: 'production',
      RENDER: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stderr = []
  server.stderr.on('data', (chunk) => stderr.push(chunk.toString()))
  const [exitCode] = await once(server, 'exit')
  assert.notEqual(exitCode, 0)
  assert.match(stderr.join(''), /Production multiplayer requires LANDRUSH_WORLD_MULTIPLAYER_DATA_DIR/)
})

test('refuses to serve an empty production data directory by default', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'landrush-empty-production-'))
  const port = await getOpenPort()
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      LANDRUSH_WORLD_MULTIPLAYER_ALLOW_EMPTY_STATE: '',
      LANDRUSH_WORLD_MULTIPLAYER_DATA_DIR: dataDirectory,
      LANDRUSH_WORLD_MULTIPLAYER_STATE_FILE: '',
      LANDRUSH_WORLD_MULTIPLAYER_WS_PORT: String(port),
      NODE_ENV: 'production',
      RENDER: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stderr = []
  server.stderr.on('data', (chunk) => stderr.push(chunk.toString()))

  try {
    const [exitCode] = await once(server, 'exit')
    assert.notEqual(exitCode, 0)
    assert.match(stderr.join(''), /configured production multiplayer save does not exist/)
  } finally {
    await rm(dataDirectory, { force: true, recursive: true })
  }
})

test('refuses to serve an invalid production save', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'landrush-invalid-production-'))
  await writeFile(join(dataDirectory, 'world-multiplayer-state.json'), '{not-json', 'utf8')
  const port = await getOpenPort()
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      LANDRUSH_WORLD_MULTIPLAYER_DATA_DIR: dataDirectory,
      LANDRUSH_WORLD_MULTIPLAYER_STATE_FILE: '',
      LANDRUSH_WORLD_MULTIPLAYER_WS_PORT: String(port),
      NODE_ENV: 'production',
      RENDER: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stderr = []
  server.stderr.on('data', (chunk) => stderr.push(chunk.toString()))

  try {
    const [exitCode] = await once(server, 'exit')
    assert.notEqual(exitCode, 0)
    assert.match(stderr.join(''), /Could not restore the configured production multiplayer save/)
  } finally {
    await rm(dataDirectory, { force: true, recursive: true })
  }
})

test('refuses to lossy-repair a malformed schema-2 build during restore', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'landrush-malformed-v2-production-'))
  const worldId = 'malformed-v2-world'
  await writeFile(
    join(dataDirectory, 'world-multiplayer-state.json'),
    JSON.stringify({
      savedAt: Date.now(),
      schemaVersion: 2,
      worlds: [
        {
          builds: [
            {
              nodes: [createCanonicalWall('duplicate-wall'), createCanonicalWall('duplicate-wall')],
              operationId: 'malformed-v2-operation',
              parcelId: 'parcel-02',
              revision: 1,
              schemaVersion: PARCEL_BUILD_SCHEMA_VERSION,
              updatedAt: Date.now(),
              updatedBy: 'malformed-builder',
              worldId,
            },
          ],
          ownerships: [],
          tvMediaStates: [],
          worldId,
        },
      ],
    }),
    'utf8',
  )
  const port = await getOpenPort()
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      LANDRUSH_WORLD_MULTIPLAYER_DATA_DIR: dataDirectory,
      LANDRUSH_WORLD_MULTIPLAYER_STATE_FILE: '',
      LANDRUSH_WORLD_MULTIPLAYER_WS_PORT: String(port),
      NODE_ENV: 'production',
      RENDER: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stderr = []
  server.stderr.on('data', (chunk) => stderr.push(chunk.toString()))

  try {
    const [exitCode] = await once(server, 'exit')
    assert.notEqual(exitCode, 0)
    assert.match(stderr.join(''), /invalid schema-2 build graph/)
  } finally {
    await rm(dataDirectory, { force: true, recursive: true })
  }
})

test('rejects noncanonical and duplicate schema-2 authority envelopes', async () => {
  const cases = [
    {
      mutate(snapshot) {
        snapshot.worlds[0].builds[0].worldId = 'other-world'
      },
      name: 'mismatched nested world ID',
    },
    {
      mutate(snapshot) {
        snapshot.worlds[0].builds[0].parcelId = ' parcel-02 '
      },
      name: 'noncanonical parcel ID',
    },
    {
      mutate(snapshot) {
        snapshot.worlds[0].builds[0].revision = -1
      },
      name: 'invalid revision',
    },
    {
      mutate(snapshot) {
        delete snapshot.worlds[0].builds[0].schemaVersion
      },
      name: 'missing build schema',
    },
    {
      mutate(snapshot) {
        snapshot.worlds.push(structuredClone(snapshot.worlds[0]))
      },
      name: 'duplicate world ID',
    },
    {
      mutate(snapshot) {
        const duplicate = structuredClone(snapshot.worlds[0].builds[0])
        duplicate.operationId = 'duplicate-parcel-operation'
        snapshot.worlds[0].builds.push(duplicate)
      },
      name: 'duplicate parcel build',
    },
    {
      mutate(snapshot) {
        snapshot.worlds[0].builds[0].operationId = ' noncanonical-operation '
      },
      name: 'noncanonical operation metadata',
    },
    {
      mutate(snapshot) {
        snapshot.worlds[0].builds[0].updatedAt = Number.MAX_SAFE_INTEGER + 1
      },
      name: 'unsafe build timestamp',
    },
  ]

  for (const entry of cases) {
    const snapshot = createCanonicalSchema2State('strict-envelope-world')
    entry.mutate(snapshot)
    await assertProductionRestoreFails(snapshot, entry.name)
  }
})

function createCanonicalSchema2State(worldId) {
  const now = Date.now()
  return {
    savedAt: now,
    schemaVersion: 2,
    worlds: [
      {
        builds: [
          {
            nodes: [createCanonicalWall('wall-strict-envelope')],
            operationId: 'strict-envelope-operation',
            parcelId: 'parcel-02',
            revision: 1,
            schemaVersion: PARCEL_BUILD_SCHEMA_VERSION,
            updatedAt: now,
            updatedBy: 'strict-builder',
            worldId,
          },
        ],
        ownerships: [],
        tvMediaStates: [],
        worldId,
      },
    ],
  }
}

async function assertProductionRestoreFails(snapshot, name) {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'landrush-strict-v2-production-'))
  await writeFile(
    join(dataDirectory, 'world-multiplayer-state.json'),
    JSON.stringify(snapshot),
    'utf8',
  )
  const port = await getOpenPort()
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      LANDRUSH_WORLD_MULTIPLAYER_DATA_DIR: dataDirectory,
      LANDRUSH_WORLD_MULTIPLAYER_STATE_FILE: '',
      LANDRUSH_WORLD_MULTIPLAYER_WS_PORT: String(port),
      NODE_ENV: 'production',
      RENDER: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(server)
  server.on('exit', () => children.delete(server))
  const stderr = []
  server.stderr.on('data', (chunk) => stderr.push(chunk.toString()))

  try {
    const outcome = await Promise.race([
      once(server, 'exit').then(([exitCode]) => ({ exitCode })),
      new Promise((resolve) => setTimeout(() => resolve({ exitCode: null }), 1500)),
    ])
    if (outcome.exitCode === null) {
      server.kill()
      await once(server, 'exit')
      assert.fail(`Server accepted ${name}`)
    }
    assert.notEqual(outcome.exitCode, 0, name)
    assert.match(stderr.join(''), /Could not restore the configured production multiplayer save/)
  } finally {
    if (server.exitCode === null) server.kill()
    await rm(dataDirectory, { force: true, recursive: true })
  }
}

function createCanonicalWall(id) {
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

function createLegacyState(worldId) {
  return {
    savedAt: 1_700_000_000_000,
    schemaVersion: 1,
    worlds: [
      {
        builds: [
          {
            nodes: [
              {
                children: [],
                end: [2, 0],
                height: 2.5,
                id: 'wall_persistent-upgrade',
                object: 'node',
                parentId: null,
                start: [0, 0],
                thickness: 0.2,
                type: 'wall',
                visible: true,
              },
            ],
            parcelId: 'parcel-02',
            updatedAt: 1_700_000_000_000,
            updatedBy: 'legacy-builder',
            worldId,
          },
        ],
        ownerships: [
          {
            claimedAt: 1_700_000_000_000,
            owner: { color: '#7dd3fc', id: 'legacy-builder', name: 'Legacy Builder' },
            parcelId: 'parcel-02',
            worldId,
          },
        ],
        tvMediaStates: [],
        worldId,
      },
    ],
  }
}

async function startServer(dataDirectory) {
  const port = await getOpenPort()
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      LANDRUSH_WORLD_MULTIPLAYER_DATA_DIR: dataDirectory,
      LANDRUSH_WORLD_MULTIPLAYER_STATE_FILE: '',
      LANDRUSH_WORLD_MULTIPLAYER_WS_PORT: String(port),
      NODE_ENV: 'production',
      RENDER: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  child.on('exit', () => children.delete(child))
  await waitForServer(port)
  return { child, port }
}

async function stopServer(child) {
  if (child.exitCode !== null) return
  child.kill()
  await once(child, 'exit')
}

async function readHealth(port) {
  const response = await fetch(`http://127.0.0.1:${port}/health`)
  assert.equal(response.ok, true)
  return response.json()
}

async function readParcelSnapshot(port, worldId) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`)
  const messages = []
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())))
  await once(socket, 'open')
  await nextMessage({ messages, socket }, (message) => message.type === 'welcome')
  socket.send(
    JSON.stringify({
      roomId: 'persistent-upgrade-test',
      type: 'watch-parcels',
      worldId,
    }),
  )
  try {
    const ownerships = await nextMessage(
      { messages, socket },
      (message) => message.type === 'parcel-ownership-snapshot',
    )
    const builds = await nextMessage(
      { messages, socket },
      (message) => message.type === 'parcel-build-nodes-snapshot',
    )
    return { builds: builds.builds, ownerships: ownerships.ownerships }
  } finally {
    socket.close()
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
