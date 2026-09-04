import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { isZombieGameSnapshot, isZombieGameStatus } from '@landrush/protocol/zombie-game'
import { WebSocket } from 'ws'

const PATH = '/api/landrush-lab/world-multiplayer/ws'

test('real authority negotiates explicitly, fails closed before world readiness, and shares 3D actors', async (t) => {
  const server = await start(t)
  const legacy = await connect(t, server)
  const legacyClosed = once(legacy.socket, 'close')
  send(legacy, joinMessage('legacy', false))
  assert.equal((await legacyClosed)[0], 1008)

  const alice = await connect(t, server)
  assert.equal(alice.welcome.zombieGameAuthority.schemaVersion, 1)
  const worldId = alice.welcome.zombieGameAuthority.worldId
  send(alice, joinMessage('alice'))
  const initial = await message(alice, (value) => value.type === 'snapshot')
  send(alice, { type: 'start-zombie-escape-night', sessionId: initial.zombieEscapeState.sessionId, baseRevision: initial.zombieEscapeState.revision })
  assert.equal((await message(alice, (value) => value.type === 'zombie-escape-state-rejected')).code, 'zombie-game-not-ready')
  await bind(alice, worldId)
  const first = await message(alice, isZombieGameSnapshot)
  assert.equal(first.phase, 'build')
  assert.equal(first.self.health, 100)
  assert.ok(first.ambientNpcs.length > 0)
  ready(alice, first)
  const day = await message(alice, (value) => isZombieGameSnapshot(value) && value.phase === 'build' && value.tick > first.tick + 30)
  assert.equal(day.ambientNpcs.length, first.ambientNpcs.length)
  assert.ok(day.ambientNpcs.some((npc, index) => npc.x !== first.ambientNpcs[index].x || npc.z !== first.ambientNpcs[index].z || npc.locomotionPhase !== first.ambientNpcs[index].locomotionPhase))

  const bob = await connect(t, server)
  send(bob, joinMessage('bob'))
  await message(bob, (value) => value.type === 'snapshot')
  await bind(bob, worldId)
  ready(bob, await message(bob, isZombieGameSnapshot))
  send(alice, { type: 'start-zombie-escape-night', sessionId: initial.zombieEscapeState.sessionId, baseRevision: initial.zombieEscapeState.revision })
  ready(alice, await message(alice, (value) => isZombieGameSnapshot(value) && value.phase === 'night'))
  ready(bob, await message(bob, (value) => isZombieGameSnapshot(value) && value.phase === 'night'))
  const night = await message(alice, (value) => isZombieGameSnapshot(value) && value.phase === 'night' && value.zombies.length > 0)
  const same = await message(bob, (value) => isZombieGameSnapshot(value) && value.sequence === night.sequence)
  assert.deepEqual(same.zombies, night.zombies)
  assert.deepEqual(same.players, night.players)
  assert.deepEqual(same.ambientNpcs, night.ambientNpcs)
  assert.equal(same.self.playerId, 'bob')
  assert.equal(night.self.playerId, 'alice')
  assert.ok(night.zombies.every((zombie) => Number.isFinite(zombie.y)))
  assert.ok(night.zombies.some((zombie) => zombie.sourceNpcIndex >= 0))
  for (const zombie of night.zombies.filter((actor) => actor.sourceNpcIndex >= 0)) {
    const source = night.ambientNpcs.find((npc) => npc.index === zombie.sourceNpcIndex)
    assert.ok(source)
    assert.ok(Math.hypot(source.x - zombie.x, source.z - zombie.z) < 1, 'night handoff must start at the current authoritative NPC position')
  }

  const input = {
    type: 'zombie-game-input', schemaVersion: 1, worldId, sessionId: night.sessionId,
    night: night.night, worldGeneration: night.worldGeneration, sequence: 1,
    aimAngle: 0, fire: false, interactPressed: false, weaponIndex: 0,
    muzzle: { x: 0, y: 1.09, z: 0.86, directionX: 0, directionY: 0, directionZ: 1 },
  }
  send(alice, input)
  const acknowledged = await message(alice, (value) => isZombieGameSnapshot(value) && value.self.lastInputSequence === 1)
  send(alice, { ...input, sequence: 2, worldGeneration: night.worldGeneration + 1 })
  send(alice, { ...input, sequence: 2, muzzle: { ...input.muzzle, x: 1000 } })
  const rejected = await message(alice, (value) => isZombieGameSnapshot(value) && value.sequence > acknowledged.sequence + 1)
  assert.equal(rejected.self.lastInputSequence, 1)

  send(alice, { type: 'report-zombie-escape-death', sessionId: night.sessionId, night: night.night })
  const afterClaim = await message(alice, (value) => isZombieGameSnapshot(value) && value.sequence > rejected.sequence)
  assert.equal(afterClaim.self.status, 'playing')
  const grant = await message(alice, (value) => value.type === 'parcel-writer-session-granted')
  send(alice, {
    type: 'apply-profile-money-operation', writerSessionId: grant.writerSessionId, writerEpoch: grant.writerEpoch,
    operation: { operationId: 'invented-kill', kind: 'zombie-kill-reward', baseRevision: 0 },
  })
  assert.equal((await message(alice, (value) => value.type === 'profile-money-operation-rejected')).code, 'server-owned-combat')

  const closed = once(alice.socket, 'close')
  alice.socket.close()
  await closed
  const reconnect = await connect(t, server)
  send(reconnect, { ...joinMessage('alice'), writerEpoch: grant.writerEpoch })
  await message(reconnect, (value) => value.type === 'snapshot')
  await bind(reconnect, worldId)
  const resumed = await message(reconnect, isZombieGameSnapshot)
  assert.equal(resumed.sessionId, night.sessionId)
  assert.equal(resumed.night, night.night)
  assert.ok(resumed.tick > night.tick)
  assert.equal(resumed.self.lastInputSequence, 1)
  assert.equal(resumed.self.ammo, acknowledged.self.ammo)
  assert.ok(resumed.zombies.some((zombie) => night.zombies.some((old) => old.slot === zombie.slot && old.generation === zombie.generation)))
  ready(reconnect, resumed)
  await message(reconnect, (value) => isZombieGameSnapshot(value) && value.sequence > resumed.sequence)
  const bobClosed = once(bob.socket, 'close')
  bob.socket.close()
  await bobClosed
  const alone = await message(reconnect, (value) => isZombieGameSnapshot(value) && value.sequence > resumed.sequence + 1)
  assert.equal(alone.phase, 'night', 'a living reconnect must rejoin the survivor quorum')
})

test('a rebound living survivor counts while rendering loads, but fresh and dead visitors do not', async (t) => {
  const server = await start(t)
  const alice = await connect(t, server)
  const worldId = alice.welcome.zombieGameAuthority.worldId
  send(alice, joinMessage('loading-survivor'))
  const initial = await message(alice, value => value.type === 'snapshot')
  const aliceGrant = await message(alice, value => value.type === 'parcel-writer-session-granted')
  await bind(alice, worldId)
  ready(alice, await message(alice, isZombieGameSnapshot))
  const bob = await connect(t, server)
  send(bob, joinMessage('idle-companion'))
  await message(bob, value => value.type === 'snapshot')
  const bobGrant = await message(bob, value => value.type === 'parcel-writer-session-granted')
  await bind(bob, worldId)
  ready(bob, await message(bob, isZombieGameSnapshot))
  send(alice, { type: 'start-zombie-escape-night', sessionId: initial.zombieEscapeState.sessionId, baseRevision: initial.zombieEscapeState.revision })
  ready(alice, await message(alice, value => isZombieGameSnapshot(value) && value.phase === 'night'))
  ready(bob, await message(bob, value => isZombieGameSnapshot(value) && value.phase === 'night'))
  const admitted = await message(alice, value => isZombieGameSnapshot(value) && value.phase === 'night' && value.zombies.length > 0)
  const closed = once(alice.socket, 'close')
  alice.socket.close()
  await closed
  const reconnect = await connect(t, server)
  send(reconnect, { ...joinMessage('loading-survivor'), writerEpoch: aliceGrant.writerEpoch })
  await message(reconnect, value => value.type === 'snapshot')
  await bind(reconnect, worldId)
  const resumed = await message(reconnect, isZombieGameSnapshot)
  assert.equal(resumed.phase, 'night')
  assert.equal(resumed.sessionId, admitted.sessionId)
  assert.equal(resumed.night, admitted.night)
  assert.equal(resumed.self.health, admitted.self.health)
  send(reconnect, {
    type: 'zombie-game-input', schemaVersion: 1, worldId, sessionId: resumed.sessionId,
    night: resumed.night, worldGeneration: resumed.worldGeneration, sequence: 1,
    aimAngle: 0, fire: true, interactPressed: false, weaponIndex: 0,
    muzzle: { x: 0, y: 1.09, z: 0.86, directionX: 0, directionY: 0, directionZ: 1 },
  })
  const newcomer = await connect(t, server)
  send(newcomer, joinMessage('never-ready-newcomer'))
  await message(newcomer, value => value.type === 'snapshot')
  await bind(newcomer, worldId)
  await message(newcomer, isZombieGameSnapshot)
  const heartbeat = setInterval(() => {
    for (const client of [bob, reconnect, newcomer]) if (client.socket.readyState === WebSocket.OPEN) send(client, { type: 'heartbeat' })
  }, 1000)
  t.after(() => clearInterval(heartbeat))
  const deadline = performance.now() + 30_000
  let afterDeath
  while (performance.now() < deadline) {
    const snapshot = await message(reconnect, isZombieGameSnapshot)
    assert.equal(snapshot.phase, 'night', 'a validated living reconnect must remain in the night quorum while unready')
    assert.equal(snapshot.self.health, resumed.self.health, 'loading survivors must not be damageable')
    assert.equal(snapshot.self.ammo, resumed.self.ammo, 'loading survivors must not fire')
    assert.equal(snapshot.self.lastInputSequence, resumed.self.lastInputSequence)
    if (snapshot.players.find(player => player.id === 'idle-companion')?.status === 'lost') { afterDeath = snapshot; break }
  }
  assert.ok(afterDeath, 'the real simulation must kill the idle companion within the bounded test')
  const bobClosed = once(bob.socket, 'close')
  bob.socket.close()
  await bobClosed
  const deadReconnect = await connect(t, server)
  send(deadReconnect, { ...joinMessage('idle-companion'), writerEpoch: bobGrant.writerEpoch })
  await message(deadReconnect, value => value.type === 'snapshot')
  await bind(deadReconnect, worldId)
  const dead = await message(deadReconnect, isZombieGameSnapshot)
  assert.equal(dead.self.health, 0)
  assert.equal(dead.self.status, 'lost')
  ready(deadReconnect, dead)
  const survivorClosed = once(reconnect.socket, 'close')
  reconnect.socket.close()
  await survivorClosed
  const dawn = await message(newcomer, value => isZombieGameSnapshot(value) && value.phase === 'build')
  assert.equal(dawn.night, resumed.night, 'a fresh unready visitor and a dead reconnect must not hold the night open')
})

test('accepted socket replacement revokes combat before the new browser binds its world', async (t) => {
  const server = await start(t)
  const original = await connect(t, server)
  const worldId = original.welcome.zombieGameAuthority.worldId
  send(original, joinMessage('prebind-replacement'))
  const initial = await message(original, value => value.type === 'snapshot')
  const grant = await message(original, value => value.type === 'parcel-writer-session-granted')
  await bind(original, worldId)
  ready(original, await message(original, isZombieGameSnapshot))
  send(original, { type: 'start-zombie-escape-night', sessionId: initial.zombieEscapeState.sessionId, baseRevision: initial.zombieEscapeState.revision })
  ready(original, await message(original, value => isZombieGameSnapshot(value) && value.phase === 'night'))
  await message(original, value => isZombieGameSnapshot(value) && value.self.health < 100 && value.self.health > 0)
  const oldClosed = once(original.socket, 'close')
  const replacement = await connect(t, server)
  send(replacement, { ...joinMessage('prebind-replacement'), writerEpoch: grant.writerEpoch })
  await message(replacement, value => value.type === 'snapshot')
  const paused = await message(replacement, isZombieGameSnapshot)
  assert.equal(paused.phase, 'night')
  assert.ok(paused.self.health > 0)
  const input = {
    type: 'zombie-game-input', schemaVersion: 1, worldId, sessionId: paused.sessionId,
    night: paused.night, worldGeneration: paused.worldGeneration, sequence: 1,
    aimAngle: 0, fire: true, interactPressed: false, weaponIndex: 0,
    muzzle: { x: 0, y: 1.09, z: 0.86, directionX: 0, directionY: 0, directionZ: 1 },
  }
  send(replacement, input)
  let snapshot = paused
  while (snapshot.tick < paused.tick + 120) {
    snapshot = await message(replacement, isZombieGameSnapshot)
    assert.equal(snapshot.phase, 'night')
    assert.equal(snapshot.self.health, paused.self.health, 'pre-bind replacement must not remain damageable')
    assert.equal(snapshot.self.ammo, paused.self.ammo, 'pre-bind replacement must not fire')
    assert.equal(snapshot.self.lastInputSequence, paused.self.lastInputSequence)
  }
  await oldClosed
  await bind(replacement, worldId)
  const rebound = await message(replacement, value => isZombieGameSnapshot(value) && value.sequence > snapshot.sequence)
  ready(replacement, rebound)
  send(replacement, { ...input, fire: false })
  await message(replacement, value => isZombieGameSnapshot(value) && value.self.lastInputSequence === 1)
})

test('cross-room socket takeover revokes old combat before the superseded socket closes', async (t) => {
  const server = await start(t, { LANDRUSH_WRITER_SESSION_CLOSE_GRACE_MS: '3000' })
  const original = await connect(t, server)
  const worldId = original.welcome.zombieGameAuthority.worldId
  send(original, joinMessage('cross-room-replacement'))
  const initial = await message(original, value => value.type === 'snapshot')
  const grant = await message(original, value => value.type === 'parcel-writer-session-granted')
  await bind(original, worldId)
  ready(original, await message(original, isZombieGameSnapshot))
  const companion = await connect(t, server)
  send(companion, joinMessage('cross-room-companion'))
  await message(companion, value => value.type === 'snapshot')
  await bind(companion, worldId)
  ready(companion, await message(companion, isZombieGameSnapshot))
  send(companion, { type: 'heartbeat' })
  await message(companion, value => value.type === 'heartbeat')
  send(original, { type: 'start-zombie-escape-night', sessionId: initial.zombieEscapeState.sessionId, baseRevision: initial.zombieEscapeState.revision })
  ready(original, await message(original, value => isZombieGameSnapshot(value) && value.phase === 'night'))
  const hurt = await message(original, value => isZombieGameSnapshot(value) && value.self.health < 100 && value.self.health > 0)
  const oldClosed = once(original.socket, 'close')
  const replacement = await connect(t, server)
  send(replacement, { ...joinMessage('cross-room-replacement'), roomId: 'cross-room-destination', writerEpoch: grant.writerEpoch })
  await message(replacement, value => value.type === 'snapshot')
  assert.equal(original.socket.readyState, WebSocket.OPEN)
  const paused = await message(companion, value => isZombieGameSnapshot(value) && value.sequence > hurt.sequence)
  const pausedHealth = paused.players.find(player => player.id === 'cross-room-replacement').health
  assert.ok(pausedHealth > 0)
  let snapshot = paused
  while (snapshot.tick < paused.tick + 120) {
    snapshot = await message(companion, isZombieGameSnapshot)
    if (snapshot.sequence <= paused.sequence) continue
    assert.equal(snapshot.phase, 'night')
    assert.equal(snapshot.players.find(player => player.id === 'cross-room-replacement').health, pausedHealth, 'cross-room takeover must immediately stop attacks in the old room')
  }
  assert.equal(original.socket.readyState, WebSocket.OPEN, 'combat must stop before physical socket cleanup')
  await oldClosed
})

test('real authority rejects visitor-selected geometry/worlds and fences scoped door acknowledgements', async (t) => {
  const server = await start(t)
  const client = await connect(t, server)
  const worldId = client.welcome.zombieGameAuthority.worldId
  send(client, joinMessage('doors'))
  await message(client, (value) => value.type === 'snapshot')
  send(client, { type: 'watch-parcels', worldId: 'invented-world' })
  await message(client, (value) => value.type === 'parcel-build-nodes-snapshot')
  send(client, { type: 'zombie-game-bind', schemaVersion: 1, worldId: 'invented-world' })
  assert.equal((await message(client, (value) => value.type === 'error')).code, 'zombie-game-bind-rejected')
  await bind(client, worldId)
  const snapshot = await message(client, isZombieGameSnapshot)
  ready(client, snapshot)
  send(client, { type: 'watch-parcels', worldId: 'another-world' })
  assert.equal((await message(client, (value) => value.type === 'error')).code, 'zombie-game-world-mismatch')
  send(client, {
    type: 'zombie-game-door', schemaVersion: 1, worldId, sessionId: snapshot.sessionId,
    night: snapshot.night, worldGeneration: snapshot.worldGeneration, sequence: 1, doorId: 'invented-door', open: true,
  })
  const rejected = await message(client, (value) => isZombieGameSnapshot(value) && value.self.lastInputSequence === 1)
  assert.deepEqual(rejected.passableObstacleIds, snapshot.passableObstacleIds)
})

test('real room keeps acknowledgements through dawn, resets only new epochs, and bounds catch-up', async () => {
  const { createZombieGameServer } = await import('./dist/zombie-game-server.mjs')
  const messages = []
  const state = { night: 0, phase: 'build', phaseEndsAt: null, revision: 0, sessionId: 'room-sequence-test' }
  const peer = { id: 'sequence-player', roomId: 'sequence-room', player: joinMessage('sequence-player').player, socket: { readyState: 1, bufferedAmount: 0 } }
  const authority = createZombieGameServer({
    context: () => ({ state, peers: [peer] }), builds: () => [], wallet: () => 200,
    money: () => assert.fail('unexpected wallet change'), died: () => assert.fail('unexpected player death'),
    failed: () => assert.fail('unexpected world failure'),
    send: (_, value) => messages.push(value), sendEncoded: (_, encoded) => messages.push(JSON.parse(encoded)),
  })
  try {
    const worldId = authority.capabilities.worldId
    assert.equal(await authority.bind(peer, { type: 'zombie-game-bind', schemaVersion: 1, worldId }), true)
    assert.equal(authority.ready(peer), false)
    const presentation = { type: 'zombie-game-ready', schemaVersion: 1, worldId, sessionId: state.sessionId, night: 0, worldGeneration: 1, phase: 'build', ready: true }
    assert.equal(authority.presentation(peer, { ...presentation, worldGeneration: 2 }), false)
    assert.equal(authority.ready(peer), false)
    assert.equal(authority.presentation(peer, presentation), true)
    assert.equal(authority.ready(peer), true)
    assert.equal(authority.survivingParticipant(peer), false)
    state.phase = 'night'
    state.night = 1
    state.phaseEndsAt = Date.now() + 180_000
    authority.phase(peer.roomId)
    assert.equal(authority.ready(peer), false, 'night must await the new phase render readiness')
    assert.equal(authority.survivingParticipant(peer), true, 'existing phase-loading participants still count')
    assert.equal(authority.survivingParticipant({ ...peer, socket: { readyState: 1, bufferedAmount: 0 } }), false)
    const replacedPeer = { ...peer }
    peer.socket = { readyState: 1, bufferedAmount: 0 }
    assert.equal(authority.ready(peer), false)
    assert.equal(authority.survivingParticipant(peer), false)
    assert.equal(await authority.bind(peer, { type: 'zombie-game-bind', schemaVersion: 1, worldId }), true)
    assert.equal(authority.survivingParticipant(peer), true)
    const input = { type: 'zombie-game-input', schemaVersion: 1, worldId, sessionId: state.sessionId, night: 1, worldGeneration: 1, sequence: 1, aimAngle: 0, fire: true, interactPressed: false, weaponIndex: 0, muzzle: { x: 0, y: 1.09, z: 0.86, directionX: 0, directionY: 0, directionZ: 1 } }
    assert.equal(authority.input(peer, input), false, 'loading clients cannot fire or become targetable')
    assert.equal(authority.presentation(peer, { ...presentation, phase: 'night', night: 1 }), true)
    authority.disconnect(replacedPeer)
    assert.equal(authority.ready(peer), true, 'late old-socket close cannot disconnect the replacement')
    assert.equal(authority.survivingParticipant(peer), true)
    assert.equal(authority.input(peer, input), true)
    const acceptedPose = peer.player
    peer.socket = { readyState: 1, bufferedAmount: 0 }
    peer.player = { ...acceptedPose, position: [100, 0.04, 0] }
    assert.equal(await authority.bind(peer, { type: 'zombie-game-bind', schemaVersion: 1, worldId }), false)
    assert.equal(authority.ready(peer), false)
    assert.equal(authority.survivingParticipant(peer), false)
    assert.equal(authority.presentation(peer, { ...presentation, phase: 'night', night: 1 }), false, 'rejected bind cannot acknowledge render readiness')
    const rejectedAt = performance.now()
    const rejectedWallTime = Date.now()
    for (let tick = 1; tick <= 900; tick += 1) {
      authority.tick(rejectedWallTime + tick * 1000 / 60, rejectedAt + tick * 1000 / 60)
    }
    const rejectedPoseSnapshot = messages.filter(isZombieGameSnapshot).at(-1)
    assert.equal(rejectedPoseSnapshot.self.health, 100, 'pose rejection must revoke engine targetability')
    assert.equal(rejectedPoseSnapshot.self.ammo, 60, 'pose rejection must clear the already held trigger')
    authority.tick(Date.now(), performance.now())
    peer.player = acceptedPose
    assert.equal(await authority.bind(peer, { type: 'zombie-game-bind', schemaVersion: 1, worldId }), true)
    assert.equal(authority.presentation(peer, { ...presentation, phase: 'night', night: 1 }), true)
    assert.equal(authority.input(peer, { ...input, sequence: 2 }), true)
    peer.player = { ...acceptedPose, position: [100, 0.04, 0] }
    assert.equal(await authority.bind(peer, { type: 'zombie-game-bind', schemaVersion: 1, worldId }), false)
    const sameSocketRejectedAt = performance.now()
    for (let tick = 1; tick <= 900; tick += 1) {
      authority.tick(Date.now() + tick * 1000 / 60, sameSocketRejectedAt + tick * 1000 / 60)
    }
    const sameSocketSnapshot = messages.filter(isZombieGameSnapshot).at(-1)
    assert.equal(sameSocketSnapshot.self.health, 100, 'same-socket pose rejection must also revoke engine targetability')
    assert.equal(sameSocketSnapshot.self.ammo, 60)
    authority.tick(Date.now(), performance.now())
    peer.player = acceptedPose
    assert.equal(await authority.bind(peer, { type: 'zombie-game-bind', schemaVersion: 1, worldId }), true)
    assert.equal(authority.presentation(peer, { ...presentation, phase: 'night', night: 1 }), true)
    authority.door(peer, { type: 'zombie-game-door', schemaVersion: 1, worldId, sessionId: state.sessionId, night: 1, worldGeneration: 1, sequence: 7, doorId: 'missing-door', open: true })
    assert.equal(messages.filter(isZombieGameSnapshot).at(-1).self.lastInputSequence, 7)
    state.phase = 'build'
    state.phaseEndsAt = null
    authority.phase(peer.roomId)
    const dawn = messages.filter(isZombieGameSnapshot).at(-1)
    assert.equal(dawn.phase, 'build')
    assert.equal(dawn.self.lastInputSequence, 7)
    assert.equal(authority.survivingParticipant(peer), false, 'participation cannot cross dawn')
    assert.equal(authority.presentation(peer, { ...presentation, night: 1 }), true)
    assert.equal(authority.door(peer, { type: 'zombie-game-door', schemaVersion: 1, worldId, sessionId: state.sessionId, night: 1, worldGeneration: 1, sequence: 6, doorId: 'missing-door', open: true }), false)
    state.phase = 'night'
    state.night = 2
    state.phaseEndsAt = Date.now() + 180_000
    authority.phase(peer.roomId)
    assert.equal(messages.filter(isZombieGameSnapshot).at(-1).self.lastInputSequence, 0)
    authority.tick(Date.now(), performance.now() + 10_000)
    assert.ok(authority.metrics().zombieGameDroppedSteps >= 597)
    assert.ok(messages.filter(value => value.type === 'zombie-game-snapshot').every(isZombieGameSnapshot))
  } finally { authority.clear(peer.roomId) }
  assert.equal(authority.metrics().zombieGameRooms, 0)
})

function joinMessage(id, negotiate = true) {
  return {
    type: 'join', roomId: 'real-zombie-game-test', gameMode: 'zombie-escape',
    ...(negotiate ? { zombieGameSchemaVersion: 1 } : {}),
    writerSessionId: `writer-${id}`,
    player: { id, name: id, color: '#7dd3fc', position: [0, 0.04, 0], heading: 0, speed: 0, moving: false },
  }
}

async function bind(client, worldId) {
  send(client, { type: 'watch-parcels', worldId })
  await message(client, (value) => value.type === 'parcel-build-nodes-snapshot')
  send(client, { type: 'zombie-game-bind', schemaVersion: 1, worldId })
  return await message(client, (value) => isZombieGameStatus(value) && value.status === 'ready')
}

function send(client, value) { client.socket.send(JSON.stringify(value)) }

function ready(client, snapshot) {
  send(client, { type: 'zombie-game-ready', schemaVersion: 1, worldId: snapshot.worldId, sessionId: snapshot.sessionId, night: snapshot.night, worldGeneration: snapshot.worldGeneration, phase: snapshot.phase, ready: true })
}

async function start(t, settings = {}) {
  const reservation = net.createServer()
  reservation.listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = reservation.address().port
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()))
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('LANDRUSH_')))
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: { ...environment, NODE_ENV: 'test', PORT: String(port), LANDRUSH_WORLD_MULTIPLAYER_HOST: '127.0.0.1', LANDRUSH_WORLD_MULTIPLAYER_STATE_FILE: 'off', LANDRUSH_ZOMBIE_GAME_AUTHORITY: '1', ...settings },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
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
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (child.exitCode !== null) throw new Error(output)
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return { port, output: () => output } } catch {}
    await delay(25)
  }
  throw new Error(`Server failed to start: ${output}`)
}

async function connect(t, server) {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}${PATH}`)
  const client = { socket, messages: [], output: server.output }
  socket.on('message', (data) => client.messages.push(JSON.parse(data.toString())))
  t.after(() => socket.terminate())
  await once(socket, 'open')
  client.welcome = await message(client, (value) => value.type === 'welcome')
  return client
}

async function message(client, predicate) {
  for (let attempt = 0; attempt < 800; attempt += 1) {
    const index = client.messages.findIndex(predicate)
    if (index >= 0) return client.messages.splice(index, 1)[0]
    if (client.socket.readyState !== WebSocket.OPEN) throw new Error(`Socket closed; ${client.output()}`)
    await delay(10)
  }
  throw new Error(`Timed out waiting for message; received ${JSON.stringify(client.messages.slice(-3))}; ${client.output()}`)
}
