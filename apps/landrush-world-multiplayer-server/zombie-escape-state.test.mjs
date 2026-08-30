import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import { after, test } from 'node:test'
import {
  isZombieEscapeFirstHouseReady,
  PARCEL_BUILD_SCHEMA_VERSION,
} from '@landrush/protocol'
import { WebSocket } from 'ws'

const WS_PATH = '/api/landrush-lab/world-multiplayer/ws'
const ZOMBIE_ESCAPE_GAME_MODE = 'zombie-escape'
const BUILD_DURATION_MS = 60_000
const NIGHT_DURATION_MS = 180_000
const children = new Set()

after(() => {
  for (const child of children) child.kill()
})

test('holds the first Zombie clock, enforces CAS and participant authority, and hydrates late joins', async () => {
  const { port, server } = await startServer()
  const roomId = 'zombie-escape-clock-room'
  const worldId = 'zombie-escape-clock-world'
  const parcelId = 'parcel-zombie-escape-clock'
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
        baseRevision: held.revision,
        sessionId: held.sessionId,
        type: 'start-zombie-escape-night',
      }),
    )
    const heldRejection = await nextMessage(
      zombie,
      (message) => message.type === 'zombie-escape-state-rejected',
    )
    assert.equal(heldRejection.code, 'zombie-escape-clock-held')
    assert.deepEqual(heldRejection.state, held)

    zombie.socket.send(
      JSON.stringify({
        baseRevision: held.revision + 1,
        sessionId: held.sessionId,
        type: 'initialize-zombie-escape-clock',
      }),
    )
    const initializationConflict = await nextMessage(
      zombie,
      (message) => message.type === 'zombie-escape-state-rejected',
    )
    assert.equal(initializationConflict.code, 'zombie-escape-state-conflict')
    assert.deepEqual(initializationConflict.state, held)

    normal.socket.send(
      JSON.stringify({
        baseRevision: held.revision,
        sessionId: held.sessionId,
        type: 'initialize-zombie-escape-clock',
      }),
    )
    const normalInitializationRejection = await nextMessage(
      normal,
      (message) => message.type === 'zombie-escape-state-rejected',
    )
    assert.equal(normalInitializationRejection.code, 'not-zombie-escape-participant')
    assert.deepEqual(normalInitializationRejection.state, held)

    zombie.socket.send(
      JSON.stringify({
        baseRevision: held.revision,
        sessionId: held.sessionId,
        type: 'initialize-zombie-escape-clock',
      }),
    )
    const missingWorldRejection = await nextMessage(
      zombie,
      (message) => message.type === 'zombie-escape-state-rejected',
    )
    assert.equal(missingWorldRejection.code, 'zombie-escape-parcel-world-unavailable')
    assert.equal(
      missingWorldRejection.message,
      'Watch the current parcel world before initializing Zombie Escape',
    )
    assert.deepEqual(missingWorldRejection.state, held)

    await watchParcelWorld(zombie, `${roomId}-mismatch`, worldId)
    zombie.socket.send(
      JSON.stringify({
        baseRevision: held.revision,
        sessionId: held.sessionId,
        type: 'initialize-zombie-escape-clock',
      }),
    )
    const mismatchedWorldRejection = await nextMessage(
      zombie,
      (message) => message.type === 'zombie-escape-state-rejected',
    )
    assert.equal(mismatchedWorldRejection.code, 'zombie-escape-parcel-world-unavailable')
    assert.deepEqual(mismatchedWorldRejection.state, held)

    const emptyWorld = await watchParcelWorld(zombie, roomId, worldId)
    assert.deepEqual(emptyWorld.builds, [])
    zombie.socket.send(
      JSON.stringify({
        baseRevision: held.revision,
        sessionId: held.sessionId,
        type: 'initialize-zombie-escape-clock',
      }),
    )
    const emptyWorldRejection = await nextMessage(
      zombie,
      (message) => message.type === 'zombie-escape-state-rejected',
    )
    assert.equal(emptyWorldRejection.code, 'zombie-escape-house-required')
    assert.equal(
      emptyWorldRejection.message,
      'Build a closed house with walls and an attached door before starting the Zombie Escape countdown',
    )
    assert.deepEqual(emptyWorldRejection.state, held)

    await claimParcel(zombie, worldId, parcelId)
    await syncParcelBuild(zombie, {
      baseRevision: 0,
      nodes: createZombieEscapeBuildNodes(parcelId, { spawn: true }),
      operationId: 'zombie-clock-spawn-only',
      parcelId,
      worldId,
    })
    zombie.socket.send(
      JSON.stringify({
        baseRevision: held.revision,
        sessionId: held.sessionId,
        type: 'initialize-zombie-escape-clock',
      }),
    )
    const spawnOnlyRejection = await nextMessage(
      zombie,
      (message) => message.type === 'zombie-escape-state-rejected',
    )
    assert.equal(spawnOnlyRejection.code, 'zombie-escape-house-required')
    assert.deepEqual(spawnOnlyRejection.state, held)

    await syncParcelBuild(zombie, {
      baseRevision: 1,
      nodes: createZombieEscapeBuildNodes(parcelId, { house: true, spawn: true }),
      operationId: 'zombie-clock-first-house',
      parcelId,
      worldId,
    })
    zombie.socket.send(
      JSON.stringify({
        baseRevision: held.revision,
        sessionId: held.sessionId,
        type: 'initialize-zombie-escape-clock',
      }),
    )
    const initializedMessage = await nextMessage(
      zombie,
      (message) => message.type === 'zombie-escape-state-updated',
    )
    const initialized = initializedMessage.state
    assertZombieEscapeState(initialized, {
      night: 0,
      phase: 'build',
      revision: 1,
      sessionId: held.sessionId,
    })
    assertDeadline(initializedMessage, initialized, BUILD_DURATION_MS)

    await syncParcelBuild(zombie, {
      baseRevision: 2,
      nodes: createZombieEscapeBuildNodes(parcelId, { spawn: true }),
      operationId: 'zombie-clock-house-deleted-after-initialize',
      parcelId,
      worldId,
    })
    zombie.socket.send(
      JSON.stringify({
        baseRevision: initialized.revision,
        sessionId: initialized.sessionId,
        type: 'initialize-zombie-escape-clock',
      }),
    )
    const initializedWithoutHouseRejection = await nextMessage(
      zombie,
      (message) => message.type === 'zombie-escape-state-rejected',
    )
    assert.equal(
      initializedWithoutHouseRejection.code,
      'zombie-escape-clock-already-initialized',
    )
    assert.deepEqual(initializedWithoutHouseRejection.state, initialized)

    normal.socket.send(
      JSON.stringify({
        baseRevision: initialized.revision,
        sessionId: initialized.sessionId,
        type: 'start-zombie-escape-night',
      }),
    )
    const normalStartRejection = await nextMessage(
      normal,
      (message) => message.type === 'zombie-escape-state-rejected',
    )
    assert.equal(normalStartRejection.code, 'not-zombie-escape-participant')
    assert.deepEqual(normalStartRejection.state, initialized)

    zombie.socket.send(
      JSON.stringify({
        baseRevision: initialized.revision,
        sessionId: initialized.sessionId,
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
      revision: 2,
      sessionId: held.sessionId,
    })
    assertDeadline(nightMessage, night, NIGHT_DURATION_MS)

    zombie.socket.send(
      JSON.stringify({
        baseRevision: held.revision,
        sessionId: held.sessionId,
        type: 'initialize-zombie-escape-clock',
      }),
    )
    const staleRejection = await nextMessage(
      zombie,
      (message) => message.type === 'zombie-escape-state-rejected',
    )
    assert.equal(staleRejection.code, 'zombie-escape-state-conflict')
    assert.deepEqual(staleRejection.state, night)

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

test('does not compose closed walls and a hosted door across committed parcels', async () => {
  const { port, server } = await startServer()
  const roomId = 'zombie-escape-cross-parcel-room'
  const worldId = 'zombie-escape-cross-parcel-world'
  const clients = []
  try {
    const zombie = await connectPlayer(port, 'cross-parcel-zombie', roomId, {
      gameMode: ZOMBIE_ESCAPE_GAME_MODE,
    })
    clients.push(zombie)
    const builder = await connectPlayer(port, 'cross-parcel-builder', roomId)
    clients.push(builder)
    const held = zombie.snapshot.zombieEscapeState
    const sharedHouseMetadataParcelId = 'cross-parcel-house-group'
    const wallNodes = createZombieEscapeBuildNodes(sharedHouseMetadataParcelId, {
      house: true,
      houseDoor: false,
    })
    const doorNodes = createZombieEscapeDoorWallBuildNodes(sharedHouseMetadataParcelId)
    assert.equal(isZombieEscapeFirstHouseReady(wallNodes), false)
    assert.equal(isZombieEscapeFirstHouseReady(doorNodes), false)
    assert.equal(isZombieEscapeFirstHouseReady([...wallNodes, ...doorNodes]), true)

    await watchParcelWorld(zombie, roomId, worldId)
    await claimParcel(zombie, worldId, 'parcel-cross-walls')
    await syncParcelBuild(zombie, {
      baseRevision: 0,
      nodes: wallNodes,
      operationId: 'build-cross-parcel-walls',
      parcelId: 'parcel-cross-walls',
      worldId,
    })
    await claimParcel(builder, worldId, 'parcel-cross-door')
    await syncParcelBuild(builder, {
      baseRevision: 0,
      nodes: doorNodes,
      operationId: 'build-cross-parcel-door',
      parcelId: 'parcel-cross-door',
      worldId,
    })

    zombie.socket.send(
      JSON.stringify({
        baseRevision: held.revision,
        sessionId: held.sessionId,
        type: 'initialize-zombie-escape-clock',
      }),
    )
    const rejection = await nextMessage(
      zombie,
      (message) => message.type === 'zombie-escape-state-rejected',
    )
    assert.equal(rejection.code, 'zombie-escape-house-required')
    assert.deepEqual(rejection.state, held)
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
    await prepareZombieEscapeHouse(
      zombie,
      roomId,
      'zombie-escape-cleanup-world',
      'parcel-zombie-escape-cleanup',
    )
    zombie.socket.send(
      JSON.stringify({
        baseRevision: held.revision,
        sessionId: held.sessionId,
        type: 'initialize-zombie-escape-clock',
      }),
    )
    await nextMessage(zombie, (message) => message.type === 'zombie-escape-state-updated')

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
    await prepareZombieEscapeHouse(
      first,
      roomId,
      'zombie-escape-replacement-world',
      'parcel-zombie-escape-replacement',
    )
    first.socket.send(
      JSON.stringify({
        baseRevision: held.revision,
        sessionId: held.sessionId,
        type: 'initialize-zombie-escape-clock',
      }),
    )
    const initializedMessage = await nextMessage(
      first,
      (message) => message.type === 'zombie-escape-state-updated',
    )
    const initialized = initializedMessage.state

    const firstClosed = once(first.socket, 'close')
    const zombieReplacement = await connectPlayer(port, 'replaceable-player', roomId, {
      gameMode: ZOMBIE_ESCAPE_GAME_MODE,
      writerSessionId: 'replaceable-zombie-b',
    })
    clients.push(zombieReplacement)
    await firstClosed
    assert.deepEqual(zombieReplacement.snapshot.zombieEscapeState, initialized)

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
    await prepareZombieEscapeHouse(
      first,
      oldRoomId,
      'zombie-escape-cross-room-world',
      'parcel-zombie-escape-cross-room',
    )
    first.socket.send(
      JSON.stringify({
        baseRevision: held.revision,
        sessionId: held.sessionId,
        type: 'initialize-zombie-escape-clock',
      }),
    )
    const initializedMessage = await nextMessage(
      first,
      (message) => message.type === 'zombie-escape-state-updated',
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
    assert.notEqual(nextHeld.sessionId, initializedMessage.state.sessionId)
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

async function prepareZombieEscapeHouse(client, roomId, worldId, parcelId) {
  await watchParcelWorld(client, roomId, worldId)
  await claimParcel(client, worldId, parcelId)
  await syncParcelBuild(client, {
    baseRevision: 0,
    nodes: createZombieEscapeBuildNodes(parcelId, { house: true }),
    operationId: `build-${parcelId}`,
    parcelId,
    worldId,
  })
}

async function watchParcelWorld(client, roomId, worldId) {
  client.socket.send(JSON.stringify({ roomId, type: 'watch-parcels', worldId }))
  return nextMessage(
    client,
    (message) =>
      message.type === 'parcel-build-nodes-snapshot' &&
      message.roomId === roomId &&
      message.worldId === worldId,
  )
}

async function claimParcel(client, worldId, parcelId) {
  client.socket.send(JSON.stringify({ parcelId, type: 'claim-parcel', worldId }))
  const result = await nextMessage(
    client,
    (message) => message.type === 'parcel-claim-result' && message.ownership?.parcelId === parcelId,
  )
  assert.equal(result.ownership.worldId, worldId)
}

async function syncParcelBuild(
  client,
  { baseRevision, nodes, operationId, parcelId, worldId },
) {
  client.socket.send(
    JSON.stringify({
      baseRevision,
      nodes,
      operationId,
      parcelId,
      schemaVersion: PARCEL_BUILD_SCHEMA_VERSION,
      type: 'sync-parcel-build-nodes',
      worldId,
      writerEpoch: client.writerEpoch,
      writerSessionId: client.writerSessionId,
    }),
  )
  return nextMessage(
    client,
    (message) => message.type === 'parcel-build-nodes-ack' && message.operationId === operationId,
  )
}

function createZombieEscapeBuildNodes(
  parcelId,
  { house = false, houseDoor = true, spawn = false } = {},
) {
  const buildingId = 'building_zombie-first-house'
  const levelId = 'level_zombie-first-house'
  const levelChildren = []
  const nodes = []
  const metadata = { landrushParcelId: parcelId }

  if (house) {
    const wallIds = [
      'wall_zombie-first-house-north',
      'wall_zombie-first-house-east',
      'wall_zombie-first-house-south',
      'wall_zombie-first-house-west',
    ]
    levelChildren.push(...wallIds)
    nodes.push(
      createBuildNode(wallIds[0], 'wall', levelId, {
        children: houseDoor ? ['door_zombie-first-house'] : [],
        end: [1, 0],
        height: 2.5,
        metadata,
        start: [0, 0],
        thickness: 0.2,
      }),
      createBuildNode(wallIds[1], 'wall', levelId, {
        children: [],
        end: [1, 1],
        height: 2.5,
        metadata,
        start: [1, 0],
        thickness: 0.2,
      }),
      createBuildNode(wallIds[2], 'wall', levelId, {
        children: [],
        end: [0, 1],
        height: 2.5,
        metadata,
        start: [1, 1],
        thickness: 0.2,
      }),
      createBuildNode(wallIds[3], 'wall', levelId, {
        children: [],
        end: [0, 0],
        height: 2.5,
        metadata,
        start: [0, 1],
        thickness: 0.2,
      }),
    )
    if (houseDoor) {
      nodes.push(
        createBuildNode('door_zombie-first-house', 'door', wallIds[0], {
          height: 2.1,
          metadata,
          position: [0.5, 1.05, 0],
          rotation: [0, 0, 0],
          width: 0.9,
        }),
      )
    }
  }
  if (spawn) {
    levelChildren.push('spawn_zombie-first-house')
    nodes.push(
      createBuildNode('spawn_zombie-first-house', 'spawn', levelId, {
        metadata,
        position: [0.5, 0, 0.5],
        rotation: 0,
      }),
    )
  }

  return [
    createBuildNode(buildingId, 'building', null, { children: [levelId], metadata }),
    createBuildNode(levelId, 'level', buildingId, {
      children: levelChildren,
      level: 0,
      metadata,
    }),
    ...nodes,
  ]
}

function createZombieEscapeDoorWallBuildNodes(parcelId) {
  const buildingId = 'building_zombie-cross-parcel-door'
  const levelId = 'level_zombie-first-house'
  const wallId = 'wall_zombie-cross-parcel-door-host'
  const metadata = { landrushParcelId: parcelId }
  return [
    createBuildNode(buildingId, 'building', null, { children: [levelId], metadata }),
    createBuildNode(levelId, 'level', buildingId, { children: [wallId], level: 0, metadata }),
    createBuildNode(wallId, 'wall', levelId, {
      children: ['door_zombie-cross-parcel'],
      end: [1, 0],
      height: 2.5,
      metadata,
      start: [0, 0],
      thickness: 0.2,
    }),
    createBuildNode('door_zombie-cross-parcel', 'door', wallId, {
      height: 2.1,
      metadata,
      position: [0.5, 1.05, 0],
      rotation: [0, 0, 0],
      width: 0.9,
    }),
  ]
}

function createBuildNode(id, type, parentId, properties = {}) {
  return {
    id,
    object: 'node',
    parentId,
    type,
    visible: true,
    ...properties,
  }
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
