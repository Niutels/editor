import type { ZombieEscapeAmbientHandoffSource } from './zombie-escape-ambient-handoff'
import {
  acknowledgeZombieEscapeFlowFieldCollisionMaskRemoval,
  inspectZombieEscapeSparseAttachmentHeapLeases,
  type ZombieEscapeCollisionWorld,
} from './zombie-escape-collision-world'
import { ZOMBIE_ESCAPE_SIMULATION, ZOMBIE_ESCAPE_WEAPON_PROFILES } from './zombie-escape-config'
import {
  createZombieEscapeControlState,
  type ZombieEscapeControlState,
} from './zombie-escape-controls'
import { resetZombieEscapePlayerTrail } from './zombie-escape-player-trail'
import {
  createZombieEscapeNavigationTargetState,
  createZombieEscapePlayerState,
  createZombieEscapeSimulation,
  installZombieEscapeAmbientHandoffCandidates,
  invalidateZombieEscapeTargetAssignment,
  prepareZombieEscapeNavigationTarget,
  setZombieEscapeCollisionWorld,
  setZombieEscapeExternalPlayerPose,
  setZombieEscapeGamePhase,
  setZombieEscapePlayerMuzzlePose,
  setZombieEscapeWeaponPickupPlacements,
  stepZombieEscapeSimulationPhysics,
  updateZombieEscapePlayerSimulation,
  ZOMBIE_ESCAPE_NAVIGATION_TARGET_KEYS,
  type ZombieEscapeGamePhase,
  type ZombieEscapeGameStatus,
  type ZombieEscapeMuzzlePose,
  type ZombieEscapeNavigationTargetState,
  type ZombieEscapePlayerState,
  type ZombieEscapeSimulation,
  zombieEscapeSparseSourceRegionReachesCommittedTarget,
} from './zombie-escape-simulation'
import type { ZombieEscapeWeaponPickupPlacement } from './zombie-escape-weapon-pickup-data'
import type { ZombieEscapeArenaData } from './zombie-escape-world'

const PLAYER_COMBAT_KEYS = [
  'fireCooldownSeconds',
  'kills',
  'lastShotGeneration',
  'lastShotSlot',
  'money',
  'nearbyPickupIndex',
  'nextShotVolleySequence',
  'purchaseFeedback',
  'weaponPurchaseCount',
] as const satisfies readonly (keyof ZombieEscapeSimulation)[]
const PLAYER_CONTEXT_KEYS = [
  ...ZOMBIE_ESCAPE_NAVIGATION_TARGET_KEYS,
  ...PLAYER_COMBAT_KEYS,
] as const
type PlayerContext = ZombieEscapeNavigationTargetState &
  Pick<ZombieEscapeSimulation, (typeof PLAYER_COMBAT_KEYS)[number]>

export type ZombieGamePlayerRuntime = PlayerContext & {
  index: number
  generation: number
  connected: boolean
  state: ZombieEscapePlayerState
  status: ZombieEscapeGameStatus
  lastInputSequence: number
  lastInputAtSeconds: number
  controls: ZombieEscapeControlState
  availableNavigationLeases: number
}

export type ZombieGamePlayerPose = Readonly<{
  x: number
  y: number
  z: number
  vx?: number
  vz?: number
  aimAngle?: number
  money?: number
}>

export type ZombieGameAcceptedInput = Readonly<{
  sequence: number
  aimAngle: number
  fire: boolean
  interactPressed: boolean
  weaponIndex: number
  muzzle: ZombieEscapeMuzzlePose
}>

export type ZombieGameRoom = {
  arena: ZombieEscapeArenaData
  simulation: ZombieEscapeSimulation
  playersCapacity: number
  players: Map<string, ZombieGamePlayerRuntime>
  playerIds: Array<string | null>
  playerSlots: Array<ZombieGamePlayerRuntime | null>
  targetPlayerIndex: Int16Array
  targetGeneration: Uint32Array
  targetSinceTick: Uint32Array
  shotOwnerPlayerIndex: Int16Array
  boundPlayer: ZombieGamePlayerRuntime | null
  targetServiceCursor: number
  spawnTargetCursor: number
  emptyInput: ZombieEscapeControlState
}

export function createZombieGameRoom({
  arena,
  seed,
  capacity,
  playersCapacity = 32,
}: {
  arena: ZombieEscapeArenaData
  seed?: number
  capacity?: number
  playersCapacity?: number
}): ZombieGameRoom {
  if (!Number.isInteger(playersCapacity) || playersCapacity < 1 || playersCapacity > 32) {
    throw new RangeError('Zombie room player capacity must be an integer from 1 to 32')
  }
  const simulation = createZombieEscapeSimulation(arena, seed, [], {
    requireSparseNavigation: true,
    zombieCapacity: capacity,
  })
  setZombieEscapeExternalPlayerPose(simulation, true)
  const room: ZombieGameRoom = {
    arena,
    simulation,
    playersCapacity,
    players: new Map(),
    playerIds: new Array(playersCapacity).fill(null),
    playerSlots: new Array(playersCapacity).fill(null),
    targetPlayerIndex: new Int16Array(simulation.zombies.pool.capacity).fill(-1),
    targetGeneration: new Uint32Array(simulation.zombies.pool.capacity),
    targetSinceTick: new Uint32Array(simulation.zombies.pool.capacity),
    shotOwnerPlayerIndex: new Int16Array(simulation.shots.pool.capacity).fill(-1),
    boundPlayer: null,
    targetServiceCursor: 0,
    spawnTargetCursor: 0,
    emptyInput: createZombieEscapeControlState(),
  }
  simulation.multiplayer = {
    activePlayerIndex: () => room.boundPlayer?.index ?? -1,
    bindPlayerIndex: (index) => {
      const player = room.playerSlots[index]
      if (player) bindPlayer(room, player)
    },
    bindZombieTarget: (slot) => bindZombieTarget(room, slot),
    collisionMaskChanged: () => {
      for (const player of room.players.values()) {
        if (player !== room.boundPlayer)
          acknowledgeZombieEscapeFlowFieldCollisionMaskRemoval(player.navigationField)
      }
    },
    healPlayers: (amount) => {
      for (const player of room.players.values()) {
        if (player.status === 'playing')
          player.state.health = Math.min(100, player.state.health + amount)
      }
    },
    navigationLeaseBudget: (slot) =>
      room.playerSlots[room.targetPlayerIndex[slot] ?? -1]?.availableNavigationLeases ?? 0,
    navigationTargetRejected: (slot) => {
      // A changed building or unavailable target invalidates a route, not the shared zombie's life.
      invalidateZombieEscapeTargetAssignment(simulation, slot, false)
      room.targetPlayerIndex[slot] = -1
      room.targetGeneration[slot] = 0
      simulation.zombies.vx[slot] = 0
      simulation.zombies.vz[slot] = 0
    },
    prepareTargets: () => prepareTargets(room),
    reserveNavigationLease: (slot) => {
      const player = room.playerSlots[room.targetPlayerIndex[slot] ?? -1]
      if (player)
        player.availableNavigationLeases = Math.max(0, player.availableNavigationLeases - 1)
    },
    selectShotOwner: (slot) => {
      const player = room.playerSlots[room.shotOwnerPlayerIndex[slot] ?? -1]
      if (player) bindPlayer(room, player)
    },
    selectSpawnTarget: () => selectSpawnTarget(room),
    spawnPositionAllowed: (x, z, minimumDistanceSquared) => {
      for (const player of room.players.values()) {
        if (!isViable(player)) continue
        if ((player.state.x - x) ** 2 + (player.state.z - z) ** 2 < minimumDistanceSquared)
          return false
      }
      return true
    },
    shotCreated: (slot) => {
      room.shotOwnerPlayerIndex[slot] = room.boundPlayer?.index ?? -1
    },
    targetMatchesActive: (slot) => room.targetPlayerIndex[slot] === room.boundPlayer?.index,
    updatePlayers: (delta) => {
      for (const player of room.players.values()) {
        if (!isViable(player)) continue
        bindPlayer(room, player)
        if (simulation.elapsedSeconds - player.lastInputAtSeconds > 0.25) {
          player.controls.fire = false
          player.controls.interactPressed = false
        }
        updateZombieEscapePlayerSimulation(simulation, player.controls, delta)
      }
      flushPlayer(room)
    },
    worldChanged: () => refreshNavigationWorld(room),
    zombieCreated: (slot) => {
      room.targetPlayerIndex[slot] = room.boundPlayer?.index ?? -1
      room.targetGeneration[slot] = 0
      room.targetSinceTick[slot] = simulation.simulationTick
    },
  }
  return room
}

export function setZombieGamePlayer(room: ZombieGameRoom, id: string, pose: ZombieGamePlayerPose) {
  if (
    !id ||
    ![pose.x, pose.y, pose.z, pose.vx ?? 0, pose.vz ?? 0, pose.aimAngle ?? 0].every(Number.isFinite)
  )
    return false
  let player = room.players.get(id)
  if (!player) {
    if (room.players.size >= room.playersCapacity) return false
    const index = room.players.size
    player = {
      ...createZombieEscapeNavigationTargetState(room.simulation.collisionWorld),
      index,
      generation: 1,
      connected: true,
      state: createZombieEscapePlayerState(room.arena),
      status: 'playing',
      lastInputSequence: 0,
      lastInputAtSeconds: Number.NEGATIVE_INFINITY,
      controls: createZombieEscapeControlState(),
      availableNavigationLeases: 0,
      fireCooldownSeconds: 0,
      kills: 0,
      lastShotGeneration: 0,
      lastShotSlot: -1,
      money: 0,
      nearbyPickupIndex: -1,
      nextShotVolleySequence: 0,
      purchaseFeedback: null,
      weaponPurchaseCount: 0,
    }
    room.players.set(id, player)
    room.playerIds[index] = id
    room.playerSlots[index] = player
  }
  player.state.x = pose.x
  player.state.y = pose.y
  player.state.z = pose.z
  player.state.vx = pose.vx ?? 0
  player.state.vz = pose.vz ?? 0
  if (pose.aimAngle !== undefined) player.state.aimAngle = pose.aimAngle
  if (pose.money !== undefined && Number.isFinite(pose.money) && pose.money >= 0) {
    player.money = pose.money
    if (room.boundPlayer === player) room.simulation.money = pose.money
  }
  return true
}

export function setZombieGamePlayerConnected(room: ZombieGameRoom, id: string, connected: boolean) {
  const player = room.players.get(id)
  if (!player) return false
  player.connected = connected
  if (!connected) clearZombieGamePlayerInput(room, id)
  return true
}

export function clearZombieGamePlayerInput(room: ZombieGameRoom, id: string) {
  const player = room.players.get(id)
  if (!player) return
  player.controls.fire = false
  player.controls.interactPressed = false
}

export function submitZombieGameInput(
  room: ZombieGameRoom,
  id: string,
  input: ZombieGameAcceptedInput,
) {
  const player = room.players.get(id)
  if (
    !player ||
    !isViable(player) ||
    !Number.isSafeInteger(input.sequence) ||
    input.sequence <= player.lastInputSequence
  )
    return false
  if (
    !Number.isFinite(input.aimAngle) ||
    !Number.isInteger(input.weaponIndex) ||
    !ZOMBIE_ESCAPE_WEAPON_PROFILES[input.weaponIndex]
  )
    return false
  if ((player.state.weaponInventoryMask & (1 << input.weaponIndex)) === 0) return false
  const muzzle = input.muzzle
  if (
    ![muzzle.x, muzzle.y, muzzle.z, muzzle.directionX, muzzle.directionY, muzzle.directionZ].every(
      Number.isFinite,
    )
  )
    return false
  if (
    Math.hypot(muzzle.x - player.state.x, muzzle.y - player.state.y, muzzle.z - player.state.z) >
    2.25
  )
    return false
  const directionLength = Math.hypot(muzzle.directionX, muzzle.directionY, muzzle.directionZ)
  if (directionLength < 0.001 || directionLength > 2) return false
  bindPlayer(room, player)
  player.state.weaponAmmoByIndex[player.state.weaponIndex] = player.state.ammo
  player.state.weaponIndex = input.weaponIndex
  player.state.ammo = player.state.weaponAmmoByIndex[input.weaponIndex]!
  player.state.aimAngle = input.aimAngle
  setZombieEscapePlayerMuzzlePose(room.simulation, muzzle)
  player.controls.aimX = Math.sin(input.aimAngle)
  player.controls.aimZ = Math.cos(input.aimAngle)
  player.controls.aimStrength = 1
  player.controls.fire = input.fire
  player.controls.interactPressed ||= input.interactPressed
  player.lastInputSequence = input.sequence
  player.lastInputAtSeconds = room.simulation.elapsedSeconds
  return true
}

export function setZombieGameWorld(
  room: ZombieGameRoom,
  {
    navigation,
    combat,
    weaponPickups,
    ambientHandoff,
  }: {
    navigation: ZombieEscapeCollisionWorld
    combat: ZombieEscapeCollisionWorld
    weaponPickups?: readonly ZombieEscapeWeaponPickupPlacement[]
    ambientHandoff?: ZombieEscapeAmbientHandoffSource
  },
) {
  setZombieEscapeCollisionWorld(room.simulation, navigation, combat)
  if (weaponPickups) setZombieEscapeWeaponPickupPlacements(room.simulation, weaponPickups)
  if (ambientHandoff) installZombieEscapeAmbientHandoffCandidates(room.simulation, ambientHandoff)
}

export function setZombieGamePhase(
  room: ZombieGameRoom,
  phase: ZombieEscapeGamePhase,
  night?: number,
  phaseSecondsRemaining?: number,
) {
  const state = room.simulation
  if (state.phase === phase && (night === undefined || state.night === night)) {
    if (phaseSecondsRemaining !== undefined)
      state.phaseSecondsRemaining = Math.max(0, phaseSecondsRemaining)
    return
  }
  flushPlayer(room)
  state.status = 'playing'
  setZombieEscapeGamePhase(state, phase)
  room.targetPlayerIndex.fill(-1)
  room.targetGeneration.fill(0)
  room.shotOwnerPlayerIndex.fill(-1)
  for (const player of room.players.values()) {
    player.controls.fire = false
    player.controls.interactPressed = false
    player.fireCooldownSeconds = 0
    player.lastShotSlot = -1
    player.lastShotGeneration = 0
    player.nextShotVolleySequence = 0
    resetZombieEscapePlayerTrail(player.playerTrail)
    player.navigationGoalResolvedTick = -1
    player.navigationRouteTargetInitialized = false
    player.state.meleePhase = 'idle'
    player.state.meleePhaseSeconds = 0
    player.state.meleeHitResolved = false
    player.state.meleeTargetSlot = -1
    player.state.meleeTargetGeneration = 0
    if (phase === 'build' && player.status !== 'playing') {
      player.state.health = 100
      player.state.hurtFlash = 0
      player.status = 'playing'
    }
    if (phase === 'night') {
      let hasAmmo = false
      for (
        let weaponIndex = 0;
        weaponIndex < player.state.weaponAmmoByIndex.length;
        weaponIndex += 1
      ) {
        if (
          (player.state.weaponInventoryMask & (1 << weaponIndex)) !== 0 &&
          player.state.weaponAmmoByIndex[weaponIndex]! > 0
        )
          hasAmmo = true
      }
      if (!hasAmmo) {
        player.state.weaponIndex = 0
        player.state.weaponInventoryMask |= 1
        player.state.ammo = ZOMBIE_ESCAPE_WEAPON_PROFILES[0].ammoGranted
        player.state.weaponAmmoByIndex[0] = player.state.ammo
      }
    }
  }
  room.boundPlayer = null
  if (night !== undefined) state.night = night
  if (phaseSecondsRemaining !== undefined)
    state.phaseSecondsRemaining = Math.max(0, phaseSecondsRemaining)
}

export function stepZombieGameRoom(room: ZombieGameRoom, deltaSeconds: number) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return
  room.simulation.status = 'playing'
  stepZombieEscapeSimulationPhysics(room.simulation, room.emptyInput, deltaSeconds, room.arena)
  flushPlayer(room)
  for (const player of room.players.values()) {
    if (player.state.health <= 0) {
      player.state.health = 0
      player.status = 'lost'
      player.controls.fire = false
    }
  }
}

function isViable(player: ZombieGamePlayerRuntime) {
  return player.connected && player.status === 'playing' && player.state.health > 0
}

function copyContext(source: PlayerContext, destination: PlayerContext) {
  for (const key of PLAYER_CONTEXT_KEYS) copyContextField(source, destination, key)
}

function copyContextField<Key extends keyof PlayerContext>(
  source: PlayerContext,
  destination: PlayerContext,
  key: Key,
) {
  destination[key] = source[key]
}

function flushPlayer(room: ZombieGameRoom) {
  if (room.boundPlayer) copyContext(room.simulation, room.boundPlayer)
}

function bindPlayer(room: ZombieGameRoom, player: ZombieGamePlayerRuntime) {
  if (room.boundPlayer === player) return
  flushPlayer(room)
  copyContext(player, room.simulation)
  room.simulation.player = player.state
  room.boundPlayer = player
}

function bindZombieTarget(room: ZombieGameRoom, slot: number) {
  const player = room.playerSlots[room.targetPlayerIndex[slot] ?? -1]
  if (!player || !isViable(player)) return false
  bindPlayer(room, player)
  return true
}

function prepareTargets(room: ZombieGameRoom) {
  const state = room.simulation
  for (let slot = 0; slot < state.zombies.pool.capacity; slot += 1) {
    if (state.zombies.pool.active[slot] === 0 || state.zombies.health[slot]! <= 0) continue
    const old = room.playerSlots[room.targetPlayerIndex[slot] ?? -1]
    const generationChanged = room.targetGeneration[slot] !== state.zombies.pool.generation[slot]
    if (!generationChanged && old && isViable(old) && state.simulationTick % 6 !== slot % 6)
      continue
    let best: ZombieGamePlayerRuntime | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    let oldReachable = false
    for (const player of room.players.values()) {
      if (!isViable(player)) continue
      bindPlayer(room, player)
      if (
        state.zombies.navigationConnector[slot]! < 0 &&
        state.navigationField.graphSparseTargetUpdate.status === 'ready' &&
        state.navigationTargetCommittedRouteGeneration > 0 &&
        !zombieEscapeSparseSourceRegionReachesCommittedTarget(
          state,
          state.zombies.x[slot]!,
          state.zombies.y[slot]!,
          state.zombies.z[slot]!,
        )
      )
        continue
      if (player === old) oldReachable = true
      const distance = Math.hypot(
        player.state.x - state.zombies.x[slot]!,
        player.state.y - state.zombies.y[slot]!,
        player.state.z - state.zombies.z[slot]!,
      )
      if (distance < bestDistance) {
        best = player
        bestDistance = distance
      }
    }
    if (!generationChanged && old && oldReachable && best !== old) {
      const oldDistance = Math.hypot(
        old.state.x - state.zombies.x[slot]!,
        old.state.y - state.zombies.y[slot]!,
        old.state.z - state.zombies.z[slot]!,
      )
      if (
        state.simulationTick - room.targetSinceTick[slot]! < 60 ||
        bestDistance + 3 >= oldDistance
      )
        best = old
    }
    if (generationChanged || room.targetPlayerIndex[slot] !== (best?.index ?? -1)) {
      if (room.targetPlayerIndex[slot] !== (best?.index ?? -1)) {
        // New NPC conversions retain their authored attack grace when assigned their first target.
        invalidateZombieEscapeTargetAssignment(state, slot, !generationChanged)
      }
      room.targetPlayerIndex[slot] = best?.index ?? -1
      room.targetGeneration[slot] = state.zombies.pool.generation[slot]!
      room.targetSinceTick[slot] = state.simulationTick
    }
  }
  const count = room.players.size
  let targetServices = 0
  for (let offset = 0; offset < count; offset += 1) {
    const player = room.playerSlots[(room.targetServiceCursor + offset) % count]
    if (!player || !isViable(player)) continue
    bindPlayer(room, player)
    const serviceTarget =
      targetServices < ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchTargetSlicesPerTick
    prepareZombieEscapeNavigationTarget(state, serviceTarget)
    if (serviceTarget) targetServices += 1
    player.availableNavigationLeases = inspectZombieEscapeSparseAttachmentHeapLeases(
      state.navigationField,
    ).availableAgentLeases
  }
  if (count > 0) room.targetServiceCursor = (room.targetServiceCursor + 1) % count
  flushPlayer(room)
}

function selectSpawnTarget(room: ZombieGameRoom) {
  const count = room.players.size
  for (let offset = 0; offset < count; offset += 1) {
    const index = (room.spawnTargetCursor + offset) % count
    const player = room.playerSlots[index]
    if (!player || !isViable(player)) continue
    bindPlayer(room, player)
    room.spawnTargetCursor = (index + 1) % count
    return true
  }
  return false
}

function refreshNavigationWorld(room: ZombieGameRoom) {
  flushPlayer(room)
  const active = room.boundPlayer
  room.boundPlayer = null
  for (const player of room.players.values()) {
    Object.assign(player, createZombieEscapeNavigationTargetState(room.simulation.collisionWorld))
  }
  for (let slot = 0; slot < room.simulation.zombies.pool.capacity; slot += 1) {
    if (room.simulation.zombies.pool.active[slot] !== 0)
      invalidateZombieEscapeTargetAssignment(room.simulation, slot)
  }
  if (active) bindPlayer(room, active)
}
