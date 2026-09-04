import {
  resolveZombieEscapeWeaponPickupPlacements,
  resolveZombieEscapeWeaponPlacementSeed,
} from '@landrush/pascal-host/zombie-escape-weapon-placement'
import type { MultiplayerZombieEscapeStateSnapshot, ParcelBuildSnapshot } from '@landrush/protocol'
import {
  isZombieGameDoor,
  isZombieGameInput,
  isZombieGameReady,
  ZOMBIE_GAME_IMPACT_FIELDS,
  ZOMBIE_GAME_POSITION_GROUPS,
  ZOMBIE_GAME_SCHEMA_VERSION,
  ZOMBIE_GAME_SHOT_FIELDS,
  ZOMBIE_GAME_ZOMBIE_FIELDS,
  type ZombieGameBind,
  type ZombieGameDoor,
  type ZombieGameInput,
  type ZombieGameReady,
  type ZombieGameSelf,
  type ZombieGameSnapshot,
  type ZombieGameStatus,
} from '@landrush/protocol/zombie-game'
import {
  installZombieEscapeAmbientHandoffCandidates,
  setZombieEscapeWeaponPickupPlacements,
  synchronizeZombieEscapePassableObstacleIds,
} from '@landrush/zombie-gameplay/zombie-escape-simulation'
import {
  clearZombieGamePlayerInput,
  createZombieGameRoom,
  setZombieGamePhase,
  setZombieGamePlayer,
  setZombieGamePlayerConnected,
  setZombieGameWorld,
  stepZombieGameRoom,
  submitZombieGameInput,
} from '@landrush/zombie-gameplay/zombie-game-room'
import { createZombieGameAmbient } from './zombie-game-ambient'
import { type createZombieGameWorld, readZombieGameWorldManifest } from './zombie-game-world'
import { createZombieGameWorldCompiler } from './zombie-game-world-compiler'

export { createZombieGameWorldCompiler } from './zombie-game-world-compiler'

const FIXED_DELTA_SECONDS = 1 / 60
const MAX_CATCHUP_STEPS = 3
const MAX_ROOMS = 4
const MAX_PLAYERS = 32
const INPUT_STALE_MS = 250
const SNAPSHOT_TICKS = 6
const MAX_BUFFERED_BYTES = 262_144

type Game = ReturnType<typeof createZombieGameRoom>
type World = Awaited<ReturnType<typeof createZombieGameWorld>>
export type ZombieGamePeer = {
  id: string
  roomId: string
  player: { position: number[]; heading: number; speed: number; moving: boolean }
  socket: { bufferedAmount: number; readyState: number }
}
type Context = {
  state: MultiplayerZombieEscapeStateSnapshot
  peers: Iterable<ZombieGamePeer>
}
type Runtime = {
  roomId: string
  worldId: string
  sessionId: string
  generation: number
  preparation: number
  status: ZombieGameStatus['status']
  error?: string
  game: Game | null
  world: World | null
  ambient: ReturnType<typeof createZombieGameAmbient> | null
  boundIds: Set<string>
  boundSockets: Map<string, ZombieGamePeer['socket']>
  admittedIds: Set<string>
  nightParticipantIds: Set<string>
  doorStates: Map<string, boolean>
  doorChangedAt: Map<string, number>
  lastInputAt: Map<string, number>
  acceptedPoseAt: Map<string, number>
  deadIds: Set<string>
  sequence: number
  tick: number
  appliedNight: number
  appliedPhase: 'build' | 'night'
  lastAudioSequence: number
  accumulator: number
  schedulerAt: number
  droppedSteps: number
}

export type ZombieGameServerHooks = {
  context(roomId: string): Context | null
  builds(worldId: string): ParcelBuildSnapshot[]
  wallet(playerId: string): number
  money(playerId: string, before: number, after: number): void
  died(roomId: string, playerId: string): void
  failed(roomId: string): void
  send(peer: ZombieGamePeer, message: unknown): void
  sendEncoded(peer: ZombieGamePeer, encoded: string): void
}

export function createZombieGameServer(hooks: ZombieGameServerHooks) {
  const rooms = new Map<string, Runtime>()
  const canonicalWorldId = readZombieGameWorldManifest().worldId
  const worldCompiler = createZombieGameWorldCompiler()

  function peers(runtime: Runtime) {
    const context = hooks.context(runtime.roomId)
    if (!context || context.state.sessionId !== runtime.sessionId) return []
    return [...context.peers].filter((peer) => runtime.boundIds.has(peer.id))
  }

  function sendStatus(runtime: Runtime, only?: ZombieGamePeer) {
    const state = hooks.context(runtime.roomId)?.state
    if (!state) return
    const message: ZombieGameStatus = {
      type: 'zombie-game-status',
      schemaVersion: ZOMBIE_GAME_SCHEMA_VERSION,
      roomId: runtime.roomId,
      worldId: runtime.worldId,
      sessionId: runtime.sessionId,
      night: state.night,
      worldGeneration: runtime.generation,
      status: runtime.status,
      ...(runtime.error ? { message: runtime.error } : {}),
    }
    for (const peer of only ? [only] : peers(runtime)) hooks.send(peer, message)
  }

  function fail(runtime: Runtime, error: unknown) {
    if (rooms.get(runtime.roomId) !== runtime) return
    runtime.status = 'error'
    runtime.error = error instanceof Error ? error.message : String(error)
    if (runtime.game) {
      for (const id of runtime.boundIds) clearZombieGamePlayerInput(runtime.game, id)
    }
    sendStatus(runtime)
    hooks.failed(runtime.roomId)
  }

  function syncPlayer(runtime: Runtime, peer: ZombieGamePeer, now: number) {
    const game = runtime.game
    if (!game) return false
    const origin = runtime.world!.origin
    const [worldX, worldY, worldZ] = peer.player.position
    if (worldX === undefined || worldY === undefined || worldZ === undefined) return false
    const x = worldX - origin.x
    const y = worldY - origin.y
    const z = worldZ - origin.z
    if (![x, y, z].every((value) => Number.isFinite(value) && Math.abs(value) <= 1_000_000))
      return false
    const previous = game.players.get(peer.id)
    const previousAt = runtime.acceptedPoseAt.get(peer.id)
    if (previous && previousAt !== undefined) {
      const distance = Math.hypot(x - previous.state.x, y - previous.state.y, z - previous.state.z)
      const allowedDistance = 2 + Math.max(0, now - previousAt) * 0.03
      if (distance > allowedDistance) return false
    }
    const accepted = setZombieGamePlayer(game, peer.id, {
      x,
      y,
      z,
      aimAngle: peer.player.heading,
      money: hooks.wallet(peer.id),
    })
    if (accepted) {
      runtime.acceptedPoseAt.set(peer.id, now)
      setZombieGamePlayerConnected(game, peer.id, runtime.admittedIds.has(peer.id))
    }
    return accepted
  }

  function applyPhase(runtime: Runtime, now: number) {
    const state = hooks.context(runtime.roomId)?.state
    const game = runtime.game
    if (!state || !game) return
    const newNight = runtime.appliedNight !== state.night
    if (newNight || runtime.appliedPhase !== state.phase) {
      runtime.nightParticipantIds.clear()
      if (state.phase === 'night') {
        for (const id of runtime.admittedIds) {
          const player = game.players.get(id)
          if (player?.status === 'playing' && player.state.health > 0)
            runtime.nightParticipantIds.add(id)
        }
      }
      runtime.admittedIds.clear()
      for (const id of runtime.boundIds) setZombieGamePlayerConnected(game, id, false)
      if (newNight && runtime.appliedNight >= 0 && runtime.world) {
        setZombieEscapeWeaponPickupPlacements(
          game.simulation,
          resolveZombieEscapeWeaponPickupPlacements(
            runtime.world.nodes,
            resolveZombieEscapeWeaponPlacementSeed({
              sessionId: runtime.sessionId,
              night: state.night,
            }),
          ),
        )
      }
      if (state.phase === 'night' && runtime.ambient) {
        installZombieEscapeAmbientHandoffCandidates(game.simulation, runtime.ambient.handoff)
      }
      setZombieGamePhase(game, state.phase, state.night, remainingSeconds(state, now))
      runtime.appliedNight = state.night
      runtime.appliedPhase = state.phase
      runtime.lastAudioSequence = 0
      runtime.lastInputAt.clear()
      runtime.deadIds.clear()
      if (newNight) {
        for (const player of game.players.values()) player.lastInputSequence = 0
      }
      sendStatus(runtime)
    }
    game.simulation.phaseSecondsRemaining = remainingSeconds(state, now)
  }

  async function prepare(runtime: Runtime) {
    const preparation = ++runtime.preparation
    runtime.status = 'loading'
    runtime.admittedIds.clear()
    if (runtime.game) {
      for (const id of runtime.boundIds) setZombieGamePlayerConnected(runtime.game, id, false)
    }
    runtime.error = undefined
    sendStatus(runtime)
    try {
      const world = await worldCompiler.compile({
        roomId: runtime.roomId,
        worldId: runtime.worldId,
        sessionId: runtime.sessionId,
        night: hooks.context(runtime.roomId)?.state.night ?? 0,
        builds: hooks.builds(runtime.worldId),
        generation: runtime.generation,
        doorStates: runtime.doorStates,
      })
      if (rooms.get(runtime.roomId) !== runtime || runtime.preparation !== preparation) return
      runtime.world = world
      if (runtime.ambient) runtime.ambient.setWorld(world.ambientWorld)
      else
        runtime.ambient = createZombieGameAmbient(
          world.ambientWorld,
          world.origin,
          world.seed,
          world.ambientClipDurations,
        )
      if (!runtime.game) {
        runtime.game = createZombieGameRoom({
          arena: world.arena,
          seed: world.seed,
          playersCapacity: MAX_PLAYERS,
        })
      }
      setZombieGameWorld(runtime.game, {
        navigation: world.navigation,
        combat: world.combat,
        weaponPickups: world.weaponPickups,
      })
      synchronizeZombieEscapePassableObstacleIds(
        runtime.game.simulation,
        world.passableObstacleIds,
        world.passableObstacleIds,
      )
      for (const player of runtime.game.players.values()) {
        player.lastInputSequence = 0
        clearZombieGamePlayerInput(runtime.game, runtime.game.playerIds[player.index]!)
      }
      runtime.lastInputAt.clear()
      runtime.acceptedPoseAt.clear()
      for (const peer of peers(runtime)) {
        if (!syncPlayer(runtime, peer, Date.now()))
          throw new Error('Zombie player capacity exceeded')
      }
      runtime.status = 'ready'
      runtime.schedulerAt = performance.now()
      runtime.accumulator = 0
      applyPhase(runtime, Date.now())
      sendStatus(runtime)
      publish(runtime, Date.now())
    } catch (error) {
      if (runtime.preparation === preparation) fail(runtime, error)
    }
  }

  function publish(runtime: Runtime, now: number) {
    if (runtime.status !== 'ready' || !runtime.game) return
    const state = hooks.context(runtime.roomId)?.state
    if (!state) return
    const game = runtime.game
    const simulation = game.simulation
    const audio: ZombieGameSnapshot['audio'] = []
    const events = simulation.audioEvents
    const first = Math.max(
      runtime.lastAudioSequence + 1,
      events.writeSequence - events.capacity + 1,
    )
    for (let sequence = first; sequence <= events.writeSequence; sequence += 1) {
      const slot = (sequence - 1) % events.capacity
      if (events.sequence[slot] !== sequence) continue
      audio.push({
        sequence,
        kind: events.kind[slot] as ZombieGameSnapshot['audio'][number]['kind'],
        subjectIndex: events.subjectIndex[slot]!,
        x: events.x[slot]! + runtime.world!.origin.x,
        y: events.y[slot]! + runtime.world!.origin.y,
        z: events.z[slot]! + runtime.world!.origin.z,
      })
    }
    runtime.lastAudioSequence = events.writeSequence
    const shared: Omit<ZombieGameSnapshot, 'self'> = {
      type: 'zombie-game-snapshot',
      schemaVersion: ZOMBIE_GAME_SCHEMA_VERSION,
      roomId: runtime.roomId,
      worldId: runtime.worldId,
      sessionId: runtime.sessionId,
      night: state.night,
      phase: state.phase,
      phaseSecondsRemaining: remainingSeconds(state, now),
      worldGeneration: runtime.generation,
      sequence: ++runtime.sequence,
      tick: runtime.tick,
      serverTime: now,
      elapsedSeconds: simulation.elapsedSeconds,
      ambientNpcs: runtime.ambient!.snapshots,
      pendingAmbientNpcIndices: [
        ...simulation.ambientHandoff.candidateNpcIndex.subarray(
          simulation.ambientHandoff.candidateCursor,
          simulation.ambientHandoff.candidateCount,
        ),
      ],
      players: [...game.players].map(([id, player]) => ({
        id,
        generation: player.generation,
        health: player.state.health,
        status: player.status,
        ackInputSequence: player.lastInputSequence,
      })),
      zombies: capturePool(simulation.zombies, ZOMBIE_GAME_ZOMBIE_FIELDS, (slot) => ({
        sourceNpcIndex: simulation.ambientHandoff.npcIndexBySlot[slot]!,
        targetPlayerId: game.playerIds[game.targetPlayerIndex[slot]!] ?? null,
      })),
      shots: capturePool(simulation.shots, ZOMBIE_GAME_SHOT_FIELDS, (slot) => ({
        ownerPlayerId: game.playerIds[game.shotOwnerPlayerIndex[slot]!] ?? 'server',
      })),
      impacts: capturePool(simulation.impactEvents, ZOMBIE_GAME_IMPACT_FIELDS),
      audio,
      destroyedObstacleIds: [...simulation.destroyedObstacleIds],
      passableObstacleIds: [...simulation.passableObstacleIds],
      obstacleHitFeedback: [...simulation.obstacleHitFeedback].map(([id, amount]) => ({
        id,
        amount,
      })),
    }
    translateRows(shared.zombies, ZOMBIE_GAME_POSITION_GROUPS.zombie, runtime.world!.origin)
    translateRows(shared.shots, ZOMBIE_GAME_POSITION_GROUPS.shot, runtime.world!.origin)
    translateRows(shared.impacts, ZOMBIE_GAME_POSITION_GROUPS.impact, runtime.world!.origin)
    for (const rows of [shared.shots, shared.impacts]) {
      for (const row of rows) {
        row.hitWorldGeneration =
          row.hitWorldGeneration === simulation.collisionWorldGeneration ? runtime.generation : 0
      }
    }
    // The horde is encoded once; only the private HUD/input acknowledgement differs by recipient.
    const prefix = JSON.stringify(shared).slice(0, -1)
    for (const peer of peers(runtime)) {
      if (peer.socket.readyState !== 1 || peer.socket.bufferedAmount > MAX_BUFFERED_BYTES) continue
      const player = game.players.get(peer.id)
      if (!player) continue
      const own = player.state
      const self: ZombieGameSelf = {
        playerId: peer.id,
        lastInputSequence: player.lastInputSequence,
        health: own.health,
        status: player.status,
        ammo: own.ammo,
        weaponIndex: own.weaponIndex,
        weaponInventoryMask: own.weaponInventoryMask,
        weaponAmmoByIndex: [...own.weaponAmmoByIndex],
        hitSlowSeconds: own.hitSlowSeconds,
        hurtFlash: own.hurtFlash,
        meleePhase: own.meleePhase,
        meleePhaseSeconds: own.meleePhaseSeconds,
        meleeSequence: own.meleeSequence,
        meleeTargetSlot: own.meleeTargetSlot,
        meleeTargetGeneration: own.meleeTargetGeneration,
        nextShotVolleySequence: player.nextShotVolleySequence,
        kills: player.kills,
        money: hooks.wallet(peer.id),
        nearbyPickupIndex: player.nearbyPickupIndex,
        purchaseFeedback: player.purchaseFeedback,
        weaponPurchaseCount: player.weaponPurchaseCount,
        weaponPickupRespawnAtSeconds: [...simulation.weaponPickupRespawnAtSeconds].map((value) =>
          Number.isFinite(value) ? value : null,
        ),
      }
      hooks.sendEncoded(peer, `${prefix},"self":${JSON.stringify(self)}}`)
    }
  }

  function scoped(peer: ZombieGamePeer, message: ZombieGameInput | ZombieGameDoor) {
    const runtime = rooms.get(peer.roomId)
    const context = hooks.context(peer.roomId)
    if (
      !runtime?.game ||
      runtime.status !== 'ready' ||
      !runtime.boundIds.has(peer.id) ||
      !context ||
      message.worldId !== runtime.worldId ||
      message.sessionId !== runtime.sessionId ||
      message.night !== context.state.night ||
      message.worldGeneration !== runtime.generation ||
      (message.type === 'zombie-game-input' && context.state.phase !== 'night')
    )
      return null
    return runtime
  }

  return {
    capabilities: { schemaVersion: ZOMBIE_GAME_SCHEMA_VERSION, worldId: canonicalWorldId },
    async bind(peer: ZombieGamePeer, message: ZombieGameBind) {
      const context = hooks.context(peer.roomId)
      if (!context || message.worldId !== canonicalWorldId) return false
      let runtime = rooms.get(peer.roomId)
      if (
        runtime &&
        (runtime.worldId !== message.worldId || runtime.sessionId !== context.state.sessionId)
      )
        return false
      if (!runtime) {
        if (rooms.size >= MAX_ROOMS) return false
        runtime = {
          roomId: peer.roomId,
          worldId: message.worldId,
          sessionId: context.state.sessionId,
          generation: 1,
          preparation: 0,
          status: 'loading',
          game: null,
          world: null,
          ambient: null,
          boundIds: new Set(),
          boundSockets: new Map(),
          admittedIds: new Set(),
          nightParticipantIds: new Set(),
          doorStates: new Map(),
          doorChangedAt: new Map(),
          lastInputAt: new Map(),
          acceptedPoseAt: new Map(),
          deadIds: new Set(),
          sequence: 0,
          tick: 0,
          appliedNight: -1,
          appliedPhase: 'build',
          lastAudioSequence: 0,
          accumulator: 0,
          schedulerAt: performance.now(),
          droppedSteps: 0,
        }
        rooms.set(peer.roomId, runtime)
      }
      if (!runtime.boundIds.has(peer.id) && runtime.boundIds.size >= MAX_PLAYERS) return false
      runtime.boundIds.add(peer.id)
      if (runtime.boundSockets.get(peer.id) !== peer.socket) {
        runtime.admittedIds.delete(peer.id)
        if (runtime.game) setZombieGamePlayerConnected(runtime.game, peer.id, false)
      }
      runtime.boundSockets.set(peer.id, peer.socket)
      if (runtime.preparation === 0) await prepare(runtime)
      else {
        if (runtime.status === 'ready' && !syncPlayer(runtime, peer, Date.now())) {
          runtime.boundSockets.delete(peer.id)
          runtime.admittedIds.delete(peer.id)
          if (runtime.game) setZombieGamePlayerConnected(runtime.game, peer.id, false)
          return false
        }
        sendStatus(runtime, peer)
        publish(runtime, Date.now())
      }
      return true
    },
    ready(peer: ZombieGamePeer) {
      const runtime = rooms.get(peer.roomId)
      return Boolean(
        runtime?.status === 'ready' &&
          runtime.boundSockets.get(peer.id) === peer.socket &&
          runtime.admittedIds.has(peer.id) &&
          runtime.game?.players.has(peer.id),
      )
    },
    survivingParticipant(peer: ZombieGamePeer) {
      const runtime = rooms.get(peer.roomId)
      const state = hooks.context(peer.roomId)?.state
      const player = runtime?.game?.players.get(peer.id)
      return Boolean(
        runtime &&
          state?.phase === 'night' &&
          state.sessionId === runtime.sessionId &&
          state.night === runtime.appliedNight &&
          runtime.status !== 'error' &&
          peer.socket.readyState === 1 &&
          runtime.boundSockets.get(peer.id) === peer.socket &&
          runtime.nightParticipantIds.has(peer.id) &&
          player?.status === 'playing' &&
          player.state.health > 0,
      )
    },
    presentation(peer: ZombieGamePeer, message: ZombieGameReady) {
      if (!isZombieGameReady(message)) return false
      const runtime = rooms.get(peer.roomId)
      const state = hooks.context(peer.roomId)?.state
      const player = runtime?.game?.players.get(peer.id)
      if (
        !runtime?.game ||
        runtime.status !== 'ready' ||
        !state ||
        !player ||
        runtime.boundSockets.get(peer.id) !== peer.socket ||
        message.worldId !== runtime.worldId ||
        message.sessionId !== runtime.sessionId ||
        message.night !== state.night ||
        message.phase !== state.phase ||
        message.worldGeneration !== runtime.generation
      )
        return false
      const admitted = message.ready && player.status === 'playing' && player.state.health > 0
      if (admitted) {
        runtime.admittedIds.add(peer.id)
        if (state.phase === 'night') runtime.nightParticipantIds.add(peer.id)
      } else runtime.admittedIds.delete(peer.id)
      setZombieGamePlayerConnected(runtime.game, peer.id, admitted)
      return true
    },
    world(peer: ZombieGamePeer) {
      const runtime = rooms.get(peer.roomId)
      return runtime?.boundIds.has(peer.id) ? runtime.worldId : null
    },
    player(peer: ZombieGamePeer, now = Date.now()) {
      const runtime = rooms.get(peer.roomId)
      if (runtime?.boundIds.has(peer.id)) syncPlayer(runtime, peer, now)
    },
    disconnect(peer: ZombieGamePeer) {
      const runtime = rooms.get(peer.roomId)
      if (runtime?.boundSockets.get(peer.id) !== peer.socket) return
      runtime.boundSockets.delete(peer.id)
      runtime.admittedIds.delete(peer.id)
      if (runtime.game) setZombieGamePlayerConnected(runtime.game, peer.id, false)
    },
    input(peer: ZombieGamePeer, message: ZombieGameInput, now = Date.now()) {
      if (!isZombieGameInput(message)) return false
      const runtime = scoped(peer, message)
      if (!runtime?.game || !runtime.admittedIds.has(peer.id)) return false
      const origin = runtime.world!.origin
      const localMessage = {
        ...message,
        muzzle: {
          ...message.muzzle,
          x: message.muzzle.x - origin.x,
          y: message.muzzle.y - origin.y,
          z: message.muzzle.z - origin.z,
        },
      }
      if (!submitZombieGameInput(runtime.game, peer.id, localMessage)) return false
      runtime.lastInputAt.set(peer.id, now)
      return true
    },
    door(peer: ZombieGamePeer, message: ZombieGameDoor, now = Date.now()) {
      if (!isZombieGameDoor(message)) return false
      const runtime = scoped(peer, message)
      const player = runtime?.game?.players.get(peer.id)
      const door = runtime?.world?.doors.get(message.doorId)
      if (
        !runtime?.game ||
        !runtime.admittedIds.has(peer.id) ||
        !player ||
        message.sequence <= player.lastInputSequence
      )
        return false
      player.lastInputSequence = message.sequence
      const origin = runtime.world!.origin
      if (
        !door ||
        !player.connected ||
        player.status !== 'playing' ||
        player.state.health <= 0 ||
        now - (runtime.doorChangedAt.get(peer.id) ?? -Infinity) < 200 ||
        Math.hypot(
          player.state.x + origin.x - door.x,
          player.state.y + origin.y - door.y,
          player.state.z + origin.z - door.z,
        ) > 3
      ) {
        publish(runtime, now)
        return false
      }
      runtime.doorStates.set(message.doorId, message.open)
      runtime.doorChangedAt.set(peer.id, now)
      const passable = new Set<string>(runtime.world!.passableObstacleIds)
      for (const [id, open] of runtime.doorStates) {
        if (open) passable.add(id)
        else passable.delete(id)
      }
      synchronizeZombieEscapePassableObstacleIds(runtime.game.simulation, passable, passable)
      publish(runtime, now)
      return true
    },
    phase(roomId: string, now = Date.now()) {
      const runtime = rooms.get(roomId)
      if (runtime?.status !== 'ready') return
      try {
        applyPhase(runtime, now)
        publish(runtime, now)
      } catch (error) {
        fail(runtime, error)
      }
    },
    refresh(worldId: string) {
      for (const runtime of rooms.values()) {
        if (runtime.worldId !== worldId) continue
        runtime.generation = (runtime.generation + 1) >>> 0 || 1
        void prepare(runtime)
      }
    },
    clear(roomId: string) {
      const runtime = rooms.get(roomId)
      worldCompiler.cancel(roomId)
      if (runtime) {
        runtime.preparation += 1
        runtime.ambient?.dispose()
      }
      rooms.delete(roomId)
    },
    tick(now = Date.now(), schedulerNow = performance.now()) {
      for (const runtime of rooms.values()) {
        if (runtime.status !== 'ready' || !runtime.game) continue
        const state = hooks.context(runtime.roomId)?.state
        if (!state || state.sessionId !== runtime.sessionId) continue
        const elapsed = Math.max(0, (schedulerNow - runtime.schedulerAt) / 1000)
        runtime.schedulerAt = schedulerNow
        const total = runtime.accumulator + elapsed
        runtime.droppedSteps += Math.max(
          0,
          Math.floor(total / FIXED_DELTA_SECONDS) - MAX_CATCHUP_STEPS,
        )
        runtime.accumulator = Math.min(total, FIXED_DELTA_SECONDS * MAX_CATCHUP_STEPS)
        try {
          applyPhase(runtime, now)
          let steps = 0
          while (runtime.accumulator >= FIXED_DELTA_SECONDS && steps < MAX_CATCHUP_STEPS) {
            const game = runtime.game
            if (state.phase === 'build') {
              runtime.ambient!.step(FIXED_DELTA_SECONDS)
            } else {
              game.simulation.phaseSecondsRemaining = remainingSeconds(state, now)
              for (const [id, player] of game.players) {
                player.money = hooks.wallet(id)
                if (game.boundPlayer === player) game.simulation.money = player.money
                if (now - (runtime.lastInputAt.get(id) ?? -Infinity) > INPUT_STALE_MS)
                  clearZombieGamePlayerInput(game, id)
              }
              stepZombieGameRoom(game, FIXED_DELTA_SECONDS)
              for (const [id, player] of game.players) {
                const before = hooks.wallet(id)
                if (player.money !== before) hooks.money(id, before, player.money)
                if (player.status === 'lost' && !runtime.deadIds.has(id)) {
                  runtime.deadIds.add(id)
                  hooks.died(runtime.roomId, id)
                }
              }
            }
            runtime.tick += 1
            runtime.accumulator -= FIXED_DELTA_SECONDS
            steps += 1
            if (runtime.tick % SNAPSHOT_TICKS === 0) publish(runtime, now)
          }
        } catch (error) {
          fail(runtime, error)
        }
      }
    },
    metrics() {
      return {
        zombieGameRooms: rooms.size,
        zombieGameWorldCompiler: worldCompiler.metrics(),
        zombieGameReadyRooms: [...rooms.values()].filter((runtime) => runtime.status === 'ready')
          .length,
        zombieGameDroppedSteps: [...rooms.values()].reduce(
          (sum, runtime) => sum + runtime.droppedSteps,
          0,
        ),
      }
    },
  }
}

function remainingSeconds(state: MultiplayerZombieEscapeStateSnapshot, now: number) {
  return state.phaseEndsAt === null
    ? 0
    : Math.max(0, Math.min(180, (state.phaseEndsAt - now) / 1000))
}

function capturePool<
  Fields extends readonly string[],
  Extra extends object = Record<string, never>,
>(
  values: { pool: { active: ArrayLike<number>; generation: ArrayLike<number>; capacity: number } },
  fields: Fields,
  extra?: (slot: number) => Extra,
): (Record<Fields[number], number> & Extra & { slot: number; generation: number })[] {
  const rows = []
  const columns = values as unknown as Record<string, ArrayLike<number>>
  for (let slot = 0; slot < values.pool.capacity; slot += 1) {
    if (!values.pool.active[slot]) continue
    const row = { slot, generation: values.pool.generation[slot], ...extra?.(slot) } as Record<
      Fields[number],
      number
    > &
      Extra & { slot: number; generation: number }
    for (const field of fields) (row as Record<string, number>)[field] = columns[field]![slot]!
    rows.push(row)
  }
  return rows
}

function translateRows(
  rows: Record<string, unknown>[],
  groups: readonly (readonly (string | null)[])[],
  origin: { x: number; y: number; z: number },
) {
  for (const row of rows) {
    for (const [x, y, z] of groups) {
      if (x) row[x] = Number(row[x]) + origin.x
      if (y) row[y] = Number(row[y]) + origin.y
      if (z) row[z] = Number(row[z]) + origin.z
    }
  }
}
