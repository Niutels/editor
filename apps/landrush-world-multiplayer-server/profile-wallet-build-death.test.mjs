import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import {
  DEFAULT_PROFILE_MONEY,
  PARCEL_BUILD_SCHEMA_VERSION,
  ZOMBIE_ESCAPE_KILL_REWARD,
} from '@landrush/protocol'
import { WebSocket } from 'ws'

const WS_PATH = '/api/landrush-lab/world-multiplayer/ws'
const ZOMBIE_ESCAPE_GAME_MODE = 'zombie-escape'
const children = new Set()
let heartbeatSequence = 0

after(() => {
  for (const child of children) child.kill()
})

test('prices authoritative builds against a persistent idempotent profile wallet', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'landrush-profile-wallet-build-'))
  const stateFile = join(dataDirectory, 'world-multiplayer-state.json')
  const profileId = 'priced-builder'
  const roomId = 'profile-wallet-build-room'
  const worldId = 'profile-wallet-build-world'
  const parcelId = 'parcel-wallet-build'
  const clients = []
  let firstServer
  let secondServer

  try {
    firstServer = await startServer({ stateFile })
    const builder = await connectPlayer(firstServer.port, profileId, roomId)
    clients.push(builder)
    assertWallet(builder.wallet, { balance: DEFAULT_PROFILE_MONEY, profileId, revision: 0 })

    const firstReward = {
      baseRevision: 0,
      kind: 'zombie-kill-reward',
      operationId: 'money-first-reward',
    }
    const rewarded = await sendMoneyOperation(builder, firstReward)
    assert.equal(rewarded.type, 'profile-money-operation-ack')
    assert.equal(rewarded.duplicate, false)
    assertWallet(rewarded.wallet, {
      balance: DEFAULT_PROFILE_MONEY + ZOMBIE_ESCAPE_KILL_REWARD,
      profileId,
      revision: 1,
    })

    const duplicateReward = await sendMoneyOperation(builder, firstReward)
    assert.equal(duplicateReward.type, 'profile-money-operation-ack')
    assert.equal(duplicateReward.duplicate, true)
    assertWallet(duplicateReward.wallet, {
      balance: DEFAULT_PROFILE_MONEY + ZOMBIE_ESCAPE_KILL_REWARD,
      profileId,
      revision: 1,
    })

    const reusedRewardId = await sendMoneyOperation(builder, {
      baseRevision: 1,
      cost: 1,
      kind: 'weapon-purchase',
      operationId: firstReward.operationId,
    })
    assert.equal(reusedRewardId.type, 'profile-money-operation-rejected')
    assert.equal(reusedRewardId.code, 'profile-money-operation-reused')
    assertWallet(reusedRewardId.wallet, {
      balance: DEFAULT_PROFILE_MONEY + ZOMBIE_ESCAPE_KILL_REWARD,
      profileId,
      revision: 1,
    })

    const purchased = await sendMoneyOperation(builder, {
      baseRevision: 1,
      cost: DEFAULT_PROFILE_MONEY + 4,
      kind: 'weapon-purchase',
      operationId: 'money-first-purchase',
    })
    assert.equal(purchased.type, 'profile-money-operation-ack')
    assertWallet(purchased.wallet, { balance: 6, profileId, revision: 2 })

    const insufficientPurchase = await sendMoneyOperation(builder, {
      baseRevision: 2,
      cost: 7,
      kind: 'weapon-purchase',
      operationId: 'money-insufficient-purchase',
    })
    assert.equal(insufficientPurchase.type, 'profile-money-operation-rejected')
    assert.equal(insufficientPurchase.code, 'insufficient-funds')
    assertWallet(insufficientPurchase.wallet, { balance: 6, profileId, revision: 2 })

    let wallet = insufficientPurchase.wallet
    let persistedRetryOperation
    for (let index = 0; index < 20; index += 1) {
      const operation = {
        baseRevision: wallet.revision,
        kind: 'zombie-kill-reward',
        operationId: `money-fund-${index}`,
      }
      const funded = await sendMoneyOperation(builder, operation)
      assert.equal(funded.type, 'profile-money-operation-ack')
      wallet = funded.wallet
      if (index === 19) persistedRetryOperation = operation
    }
    assertWallet(wallet, { balance: 206, profileId, revision: 22 })

    builder.socket.send(JSON.stringify({ parcelId, type: 'claim-parcel', worldId }))
    const claim = await nextMessage(
      builder,
      (message) => message.type === 'parcel-claim-result' && message.ownership?.parcelId === parcelId,
    )
    assert.equal(claim.ownership.owner.id, profileId)

    const containers = createPricedGraph()
    const containersAck = await sendBuild(builder, {
      baseRevision: 0,
      nodes: containers,
      operationId: 'build-containers',
      parcelId,
      worldId,
    })
    assert.equal(containersAck.type, 'parcel-build-nodes-ack')
    assert.equal(containersAck.revision, 1)
    assertWallet(containersAck.wallet, { balance: 206, profileId, revision: 22 })

    const straightWall = createPricedGraph({ straightWall: true })
    const straightWallAck = await sendBuild(builder, {
      baseRevision: 1,
      nodes: straightWall,
      operationId: 'build-straight-wall',
      parcelId,
      worldId,
    })
    assert.equal(straightWallAck.type, 'parcel-build-nodes-ack')
    assert.equal(straightWallAck.revision, 2)
    assertWallet(straightWallAck.wallet, { balance: 166, profileId, revision: 23 })

    const freeFence = createPricedGraph({ fence: true, straightWall: true })
    const freeFenceAck = await sendBuild(builder, {
      baseRevision: 2,
      nodes: freeFence,
      operationId: 'build-free-fence',
      parcelId,
      worldId,
    })
    assert.equal(freeFenceAck.type, 'parcel-build-nodes-ack')
    assert.equal(freeFenceAck.revision, 3)
    assertWallet(freeFenceAck.wallet, { balance: 166, profileId, revision: 23 })

    const curvedWall = createPricedGraph({ curvedWall: true, fence: true, straightWall: true })
    const curvedWallAck = await sendBuild(builder, {
      baseRevision: 3,
      nodes: curvedWall,
      operationId: 'build-curved-wall',
      parcelId,
      worldId,
    })
    assert.equal(curvedWallAck.type, 'parcel-build-nodes-ack')
    assert.equal(curvedWallAck.revision, 4)
    assertWallet(curvedWallAck.wallet, { balance: 103, profileId, revision: 24 })

    const item = createPricedGraph({
      curvedWall: true,
      fence: true,
      item: true,
      straightWall: true,
    })
    const itemAck = await sendBuild(builder, {
      baseRevision: 4,
      nodes: item,
      operationId: 'build-item',
      parcelId,
      worldId,
    })
    assert.equal(itemAck.type, 'parcel-build-nodes-ack')
    assert.equal(itemAck.revision, 5)
    assertWallet(itemAck.wallet, { balance: 53, profileId, revision: 25 })

    const door = createPricedGraph({
      curvedWall: true,
      door: true,
      fence: true,
      item: true,
      straightWall: true,
    })
    const doorAck = await sendBuild(builder, {
      baseRevision: 5,
      nodes: door,
      operationId: 'build-door',
      parcelId,
      worldId,
    })
    assert.equal(doorAck.type, 'parcel-build-nodes-ack')
    assert.equal(doorAck.revision, 6)
    assertWallet(doorAck.wallet, { balance: 43, profileId, revision: 26 })

    const acceptedGraph = createPricedGraph({
      curvedWall: true,
      door: true,
      fence: true,
      item: true,
      spawn: true,
      straightWall: true,
    })
    const authoredTypeAck = await sendBuild(builder, {
      baseRevision: 6,
      nodes: acceptedGraph,
      operationId: 'build-authored-spawn',
      parcelId,
      worldId,
    })
    assert.equal(authoredTypeAck.type, 'parcel-build-nodes-ack')
    assert.equal(authoredTypeAck.revision, 7)
    assertWallet(authoredTypeAck.wallet, { balance: 33, profileId, revision: 27 })

    const duplicateBuild = await sendBuild(builder, {
      baseRevision: 6,
      nodes: acceptedGraph,
      operationId: 'build-authored-spawn',
      parcelId,
      worldId,
    })
    assert.equal(duplicateBuild.type, 'parcel-build-nodes-ack')
    assert.equal(duplicateBuild.revision, 7)
    assertWallet(duplicateBuild.wallet, { balance: 33, profileId, revision: 27 })

    const unaffordable = await sendBuild(builder, {
      baseRevision: 7,
      nodes: createPricedGraph({
        curvedWall: true,
        door: true,
        extraWall: true,
        fence: true,
        item: true,
        spawn: true,
        straightWall: true,
      }),
      operationId: 'build-insufficient-wallet',
      parcelId,
      worldId,
    })
    assert.equal(unaffordable.type, 'parcel-build-nodes-insufficient-funds')
    assert.equal(unaffordable.cost, 40)
    assert.equal(unaffordable.build.operationId, 'build-authored-spawn')
    assert.equal(unaffordable.build.revision, 7)
    assertWallet(unaffordable.wallet, { balance: 33, profileId, revision: 27 })

    const unknown = await sendBuild(builder, {
      baseRevision: 7,
      nodes: createPricedGraph({
        curvedWall: true,
        door: true,
        fence: true,
        item: true,
        spawn: true,
        straightWall: true,
        unknown: true,
      }),
      operationId: 'build-unknown-node',
      parcelId,
      worldId,
    })
    assert.equal(unknown.type, 'parcel-build-nodes-rejected')
    assert.equal(unknown.code, 'unpriced-build-node')

    const malformedWall = await sendBuild(builder, {
      baseRevision: 7,
      nodes: createPricedGraph({
        curvedWall: true,
        door: true,
        fence: true,
        item: true,
        malformedWall: true,
        spawn: true,
        straightWall: true,
      }),
      operationId: 'build-malformed-wall',
      parcelId,
      worldId,
    })
    assert.equal(malformedWall.type, 'parcel-build-nodes-rejected')
    assert.equal(malformedWall.code, 'unpriced-build-node')

    const authority = await readBuildSnapshot(builder, roomId, worldId)
    assert.equal(authority.builds.length, 1)
    assert.equal(authority.builds[0].operationId, 'build-authored-spawn')
    assert.equal(authority.builds[0].revision, 7)
    assert.deepEqual(authority.builds[0].nodes, sortNodes(acceptedGraph))

    const unchangedWallet = await sendBuild(builder, {
      baseRevision: 6,
      nodes: acceptedGraph,
      operationId: 'build-authored-spawn',
      parcelId,
      worldId,
    })
    assertWallet(unchangedWallet.wallet, { balance: 33, profileId, revision: 27 })

    await waitForPersistedState(stateFile, (state) => {
      const persistedWallet = state.profileWallets?.find((entry) => entry.profileId === profileId)
      const persistedBuild = state.worlds
        ?.find((world) => world.worldId === worldId)
        ?.builds?.find((build) => build.parcelId === parcelId)
      return (
        persistedWallet?.balance === 33 &&
        persistedWallet.revision === 27 &&
        persistedBuild?.operationId === 'build-authored-spawn' &&
        persistedBuild.revision === 7
      )
    })

    await closeClient(builder)
    await stopServer(firstServer.child)
    firstServer = null

    secondServer = await startServer({ stateFile })
    const reconnected = await connectPlayer(secondServer.port, profileId, roomId, {
      writerSessionId: 'writer-priced-builder-after-restart',
    })
    clients.push(reconnected)
    assertWallet(reconnected.wallet, { balance: 33, profileId, revision: 27 })

    assert.ok(persistedRetryOperation)
    const persistedRetry = await sendMoneyOperation(reconnected, persistedRetryOperation)
    assert.equal(persistedRetry.type, 'profile-money-operation-ack')
    assert.equal(persistedRetry.duplicate, true)
    assertWallet(persistedRetry.wallet, { balance: 33, profileId, revision: 27 })

    const restoredAuthority = await readBuildSnapshot(reconnected, roomId, worldId)
    assert.equal(restoredAuthority.builds.length, 1)
    assert.equal(restoredAuthority.builds[0].operationId, 'build-authored-spawn')
    assert.equal(restoredAuthority.builds[0].revision, 7)
    assert.deepEqual(restoredAuthority.builds[0].nodes, sortNodes(acceptedGraph))
  } finally {
    for (const client of clients) await closeClient(client)
    if (firstServer) await stopServer(firstServer.child)
    if (secondServer) await stopServer(secondServer.child)
    await rm(dataDirectory, { force: true, recursive: true })
  }
})

test('ends Night only after the last alive report and keeps a dead reconnect eliminated', async () => {
  const server = await startServer()
  const roomId = 'zombie-all-dead-room'
  const clients = []

  try {
    const first = await connectPlayer(server.port, 'zombie-first', roomId, {
      gameMode: ZOMBIE_ESCAPE_GAME_MODE,
    })
    clients.push(first)
    const second = await connectPlayer(server.port, 'zombie-second', roomId, {
      gameMode: ZOMBIE_ESCAPE_GAME_MODE,
    })
    clients.push(second)

    const held = first.snapshot.zombieEscapeState
    assert.ok(held)
    assert.equal(held.phase, 'build')
    assert.equal(held.night, 0)
    assert.equal(held.revision, 0)
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
    assert.equal(night.night, 1)
    assert.equal(night.revision, 1)
    assert.ok(night.phaseEndsAt > nightMessage.serverTime)

    first.socket.send(
      JSON.stringify({
        night: night.night + 1,
        sessionId: night.sessionId,
        type: 'report-zombie-escape-death',
      }),
    )
    await heartbeatBarrier(first)

    first.socket.send(
      JSON.stringify({
        night: night.night,
        sessionId: night.sessionId,
        type: 'report-zombie-escape-death',
      }),
    )
    await heartbeatBarrier(first)

    const firstClosed = once(first.socket, 'close')
    first.socket.close()
    await firstClosed
    await nextMessage(
      second,
      (message) => message.type === 'player-left' && message.id === 'zombie-first',
    )

    const deadReconnect = await connectPlayer(server.port, 'zombie-first', roomId, {
      gameMode: ZOMBIE_ESCAPE_GAME_MODE,
      writerSessionId: 'writer-zombie-first-reconnected-dead',
    })
    clients.push(deadReconnect)
    assert.deepEqual(deadReconnect.snapshot.zombieEscapeState, night)

    deadReconnect.socket.send(
      JSON.stringify({
        night: night.night,
        sessionId: night.sessionId,
        type: 'report-zombie-escape-death',
      }),
    )
    await heartbeatBarrier(deadReconnect)

    second.socket.send(
      JSON.stringify({
        night: night.night,
        sessionId: 'stale-zombie-session',
        type: 'report-zombie-escape-death',
      }),
    )
    await heartbeatBarrier(second)

    const beforeLastDeath = await connectWatcher(server.port, roomId)
    clients.push(beforeLastDeath)
    assert.deepEqual(beforeLastDeath.snapshot.zombieEscapeState, night)

    second.socket.send(
      JSON.stringify({
        night: night.night,
        sessionId: night.sessionId,
        type: 'report-zombie-escape-death',
      }),
    )
    const completedMessage = await nextMessage(
      second,
      (message) =>
        message.type === 'zombie-escape-state-updated' &&
        message.state?.phase === 'build' &&
        message.state.revision === night.revision + 1,
    )
    const completed = completedMessage.state
    assert.equal(completed.sessionId, night.sessionId)
    assert.equal(completed.night, night.night)
    assert.equal(completed.revision, night.revision + 1)
    assert.equal(completed.phaseEndsAt, null)

    second.socket.send(
      JSON.stringify({
        night: night.night,
        sessionId: night.sessionId,
        type: 'report-zombie-escape-death',
      }),
    )
    await heartbeatBarrier(second)
    deadReconnect.socket.send(
      JSON.stringify({
        night: night.night + 1,
        sessionId: night.sessionId,
        type: 'report-zombie-escape-death',
      }),
    )
    await heartbeatBarrier(deadReconnect)

    const afterDuplicateReports = await connectWatcher(server.port, roomId)
    clients.push(afterDuplicateReports)
    assert.deepEqual(afterDuplicateReports.snapshot.zombieEscapeState, completed)

    second.socket.send(
      JSON.stringify({
        baseRevision: completed.revision,
        sessionId: completed.sessionId,
        type: 'start-zombie-escape-night',
      }),
    )
    const nextNightMessage = await nextMessage(
      second,
      (message) =>
        message.type === 'zombie-escape-state-updated' &&
        message.state?.phase === 'night' &&
        message.state.revision === completed.revision + 1,
    )
    assert.equal(nextNightMessage.state.night, completed.night + 1)
    assert.equal(nextNightMessage.state.revision, completed.revision + 1)
    assert.ok(nextNightMessage.state.phaseEndsAt > nextNightMessage.serverTime)
  } finally {
    for (const client of clients) await closeClient(client)
    await stopServer(server.child)
  }
})

function createPricedGraph(options = {}) {
  const levelId = 'level_priced-ground'
  const buildingId = 'building_priced'
  const levelChildren = []
  const nodes = []

  if (options.straightWall) {
    levelChildren.push('wall_priced-straight')
    nodes.push(
      createWall('wall_priced-straight', levelId, [0, 0], [4, 0], {
        children: options.door ? ['door_priced'] : [],
      }),
    )
  }
  if (options.fence) {
    levelChildren.push('fence_priced-free')
    nodes.push(
      createNode('fence_priced-free', 'fence', levelId, {
        end: [8, 3],
        start: [0, 3],
      }),
    )
  }
  if (options.curvedWall) {
    levelChildren.push('wall_priced-curved')
    nodes.push(
      createWall('wall_priced-curved', levelId, [0, 6], [4, 6], {
        children: [],
        curveOffset: 2,
      }),
    )
  }
  if (options.item) {
    levelChildren.push('item_priced')
    nodes.push(
      createNode('item_priced', 'item', levelId, {
        asset: {
          category: 'test',
          dimensions: [1, 1, 1],
          id: 'priced-item',
          name: 'Priced Item',
          offset: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          source: 'library',
          src: 'asset://priced-item',
          thumbnail: '',
        },
        children: [],
        position: [1, 0, 1],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      }),
    )
  }
  if (options.door) {
    nodes.push(
      createNode('door_priced', 'door', 'wall_priced-straight', {
        height: 2.1,
        position: [2, 1.05, 0],
        rotation: [0, 0, 0],
        width: 0.9,
      }),
    )
  }
  if (options.spawn) {
    levelChildren.push('spawn_priced')
    nodes.push(
      createNode('spawn_priced', 'spawn', levelId, {
        position: [2, 0, 2],
        rotation: 0,
      }),
    )
  }
  if (options.extraWall) {
    levelChildren.push('wall_priced-insufficient')
    nodes.push(createWall('wall_priced-insufficient', levelId, [0, 9], [4, 9], { children: [] }))
  }
  if (options.unknown) {
    levelChildren.push('plugin_priced-unknown')
    nodes.push(createNode('plugin_priced-unknown', 'plugin:unknown-build', levelId))
  }
  if (options.malformedWall) {
    levelChildren.push('wall_priced-malformed')
    nodes.push(
      createWall('wall_priced-malformed', levelId, ['not-a-number', 12], [4, 12], {
        children: [],
      }),
    )
  }

  return [
    createNode(buildingId, 'building', null, { children: [levelId] }),
    createNode(levelId, 'level', buildingId, { children: levelChildren, level: 0 }),
    ...nodes,
  ]
}

function createWall(id, parentId, start, end, properties = {}) {
  return createNode(id, 'wall', parentId, {
    children: [],
    end,
    height: 2.5,
    start,
    thickness: 0.2,
    ...properties,
  })
}

function createNode(id, type, parentId, properties = {}) {
  return {
    id,
    object: 'node',
    parentId,
    type,
    visible: true,
    ...properties,
  }
}

function sortNodes(nodes) {
  return structuredClone(nodes).sort((first, second) => first.id.localeCompare(second.id))
}

function assertWallet(wallet, { balance, profileId, revision }) {
  assert.ok(wallet)
  assert.equal(wallet.profileId, profileId)
  assert.equal(wallet.balance, balance)
  assert.equal(wallet.revision, revision)
  assert.equal(typeof wallet.updatedAt, 'number')
}

async function sendMoneyOperation(client, operation) {
  client.socket.send(
    JSON.stringify({
      operation,
      type: 'apply-profile-money-operation',
      writerEpoch: client.writerEpoch,
      writerSessionId: client.writerSessionId,
    }),
  )
  return nextMessage(
    client,
    (message) =>
      message.operationId === operation.operationId &&
      (message.type === 'profile-money-operation-ack' ||
        message.type === 'profile-money-operation-rejected'),
  )
}

async function sendBuild(
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
    (message) =>
      message.operationId === operationId &&
      (message.type === 'parcel-build-nodes-ack' ||
        message.type === 'parcel-build-nodes-conflict' ||
        message.type === 'parcel-build-nodes-insufficient-funds' ||
        message.type === 'parcel-build-nodes-rejected'),
  )
}

async function readBuildSnapshot(client, roomId, worldId) {
  client.socket.send(JSON.stringify({ roomId, type: 'watch-parcels', worldId }))
  return nextMessage(
    client,
    (message) =>
      message.type === 'parcel-build-nodes-snapshot' && message.worldId === worldId,
  )
}

async function heartbeatBarrier(client) {
  heartbeatSequence += 1
  const sentAt = heartbeatSequence
  client.socket.send(JSON.stringify({ sentAt, type: 'heartbeat' }))
  await nextMessage(
    client,
    (message) => message.type === 'heartbeat' && message.sentAt === sentAt,
  )
}

async function startServer({ stateFile = 'off' } = {}) {
  const port = await getOpenPort()
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      LANDRUSH_WORLD_MULTIPLAYER_STATE_FILE: stateFile,
      LANDRUSH_WORLD_MULTIPLAYER_WS_PORT: String(port),
      NODE_ENV: 'test',
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
  const money = await nextMessage(client, (message) => message.type === 'profile-money-snapshot')
  return {
    ...client,
    snapshot,
    wallet: money.wallet,
    writerEpoch: grant.writerEpoch,
    writerSessionId,
  }
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

async function closeClient(client) {
  if (!client || client.socket.readyState === WebSocket.CLOSED) return
  const closed = once(client.socket, 'close')
  client.socket.close()
  await closed
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

async function waitForPersistedState(stateFile, predicate) {
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    try {
      const state = JSON.parse(await readFile(stateFile, 'utf8'))
      if (predicate(state)) return state
    } catch {
      // The atomic writer may not have published its first complete snapshot yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  throw new Error('Timed out waiting for the wallet/build state to persist')
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
