import {
  isZombieGameSnapshot,
  ZOMBIE_GAME_IMPACT_FIELDS,
  ZOMBIE_GAME_LIMITS,
  ZOMBIE_GAME_POSITION_GROUPS,
  ZOMBIE_GAME_SHOT_FIELDS,
  ZOMBIE_GAME_ZOMBIE_FIELDS,
  type ZombieGameAmbientNpc,
  type ZombieGameSnapshot,
} from '@landrush/protocol/zombie-game'
import {
  bindZombieEscapeAmbientHandoffOwnership,
  resetZombieEscapeAmbientHandoff,
} from '@landrush/zombie-gameplay/zombie-escape-ambient-handoff'
import { emitZombieEscapeAudioEvent } from '@landrush/zombie-gameplay/zombie-escape-audio-events'
import type { ZombieEscapeFixedPool } from '@landrush/zombie-gameplay/zombie-escape-pool'
import type { ZombieEscapeSimulation } from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { ZOMBIE_ESCAPE_ZOMBIE_CATALOG } from '@landrush/zombie-gameplay/zombie-escape-zombie-catalog'

export type LandrushZombieGameReplicaScope = Readonly<{
  roomId: string
  worldId: string
  playerId: string
  sessionId: string
  night: number
  worldGeneration: number
  transportGeneration: number
}>
type Origin = Readonly<{ x: number; y: number; z: number }>
type NumericArray = Float32Array | Uint8Array | Uint32Array | Int16Array | Int32Array
type Row = { slot: number; generation: number }
type PoolReplica = { wireGeneration: Uint32Array; previousIndex: Int32Array }

export type LandrushZombieGameReplica = {
  scope: LandrushZombieGameReplicaScope
  latest: ZombieGameSnapshot | null
  previous: ZombieGameSnapshot | null
  receivedAtMs: number
  origin: Origin
  audioSequence: number
  deathPresentationRevision: number
  zombies: PoolReplica
  shots: PoolReplica
  impacts: PoolReplica
  variantCapacity: Uint16Array
  variantCount: Uint16Array
  ambientNpcs: (ZombieGameAmbientNpc | null)[]
  ambientPreviousIndex: Int16Array
  ambientPresent: Uint8Array
}

export function createLandrushZombieGameReplica(
  simulation: ZombieEscapeSimulation,
  scope: LandrushZombieGameReplicaScope,
): LandrushZombieGameReplica {
  const variantCapacity = new Uint16Array(ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length)
  for (const variant of simulation.variantByPoolSlot) variantCapacity[variant]! += 1
  for (let index = 0; index < variantCapacity.length; index += 1) {
    const body = ZOMBIE_ESCAPE_ZOMBIE_CATALOG[index]!.bodyClass
    if (body === 'heavy' || body === 'brute')
      variantCapacity[index] = Math.max(1, variantCapacity[index]!)
  }
  const pool = (capacity: number): PoolReplica => ({
    wireGeneration: new Uint32Array(capacity),
    previousIndex: new Int32Array(capacity).fill(-1),
  })
  return {
    scope: { ...scope },
    latest: null,
    previous: null,
    receivedAtMs: 0,
    origin: { x: 0, y: 0, z: 0 },
    audioSequence: 0,
    deathPresentationRevision: 0,
    zombies: pool(simulation.zombies.pool.capacity),
    shots: pool(simulation.shots.pool.capacity),
    impacts: pool(simulation.impactEvents.pool.capacity),
    variantCapacity,
    variantCount: new Uint16Array(variantCapacity.length),
    ambientNpcs: Array.from({ length: ZOMBIE_GAME_LIMITS.ambientNpcs }, () => null),
    ambientPreviousIndex: new Int16Array(ZOMBIE_GAME_LIMITS.ambientNpcs).fill(-1),
    ambientPresent: new Uint8Array(ZOMBIE_GAME_LIMITS.ambientNpcs),
  }
}

export function resetLandrushZombieGameReplicaScope(
  replica: LandrushZombieGameReplica,
  simulation: ZombieEscapeSimulation,
  scope: LandrushZombieGameReplicaScope,
) {
  replica.scope = { ...scope }
  replica.latest = null
  replica.previous = null
  replica.audioSequence = 0
  replica.deathPresentationRevision += 1
  replica.ambientNpcs.fill(null)
  replica.ambientPreviousIndex.fill(-1)
  replica.ambientPresent.fill(0)
  for (const pool of [replica.zombies, replica.shots, replica.impacts]) {
    pool.wireGeneration.fill(0)
    pool.previousIndex.fill(-1)
  }
  for (const pool of [
    simulation.zombies.pool,
    simulation.shots.pool,
    simulation.impactEvents.pool,
  ]) {
    pool.active.fill(0)
    pool.activeCount = 0
    pool.generation.fill(0)
  }
  resetZombieEscapeAmbientHandoff(simulation.ambientHandoff)
  if (simulation.destroyedObstacleIds.size > 0 || simulation.passableObstacleIds.size > 0)
    simulation.obstacleRevision += 1
  simulation.destroyedObstacleIds.clear()
  simulation.passableObstacleIds.clear()
  simulation.obstacleHitFeedback.clear()
}

export function applyLandrushZombieGameSnapshot(
  replica: LandrushZombieGameReplica,
  simulation: ZombieEscapeSimulation,
  candidate: unknown,
  {
    receivedAtMs,
    transportGeneration,
    origin,
  }: { receivedAtMs: number; transportGeneration: number; origin: Origin },
): boolean {
  if (
    !isZombieGameSnapshot(candidate) ||
    !Number.isFinite(receivedAtMs) ||
    !Number.isFinite(origin.x) ||
    !Number.isFinite(origin.y) ||
    !Number.isFinite(origin.z)
  )
    return false
  const scope = replica.scope
  if (
    transportGeneration !== scope.transportGeneration ||
    candidate.roomId !== scope.roomId ||
    candidate.worldId !== scope.worldId ||
    candidate.sessionId !== scope.sessionId ||
    candidate.night !== scope.night ||
    candidate.worldGeneration !== scope.worldGeneration ||
    candidate.self.playerId !== scope.playerId
  )
    return false
  const latest = replica.latest
  if (
    latest &&
    (candidate.sequence <= latest.sequence ||
      candidate.tick < latest.tick ||
      candidate.serverTime < latest.serverTime ||
      receivedAtMs < replica.receivedAtMs ||
      candidate.self.lastInputSequence < latest.self.lastInputSequence)
  )
    return false
  if (!fitsSimulation(replica, simulation, candidate)) return false

  replica.previous = latest
  replica.latest = candidate
  replica.receivedAtMs = receivedAtMs
  replica.origin = origin
  replica.ambientPreviousIndex.fill(-1)
  replica.ambientPresent.fill(0)
  if (latest)
    for (let index = 0; index < latest.ambientNpcs.length; index += 1)
      replica.ambientPreviousIndex[latest.ambientNpcs[index]!.index] = index
  for (const npc of candidate.ambientNpcs) {
    replica.ambientPresent[npc.index] = 1
    const current = replica.ambientNpcs[npc.index]
    if (current) Object.assign(current, npc)
    else replica.ambientNpcs[npc.index] = { ...npc }
  }
  for (let index = 0; index < replica.ambientNpcs.length; index += 1)
    if (!replica.ambientPresent[index]) replica.ambientNpcs[index] = null
  applyPool(
    replica.zombies,
    simulation.zombies,
    candidate.zombies,
    latest?.zombies,
    ZOMBIE_GAME_ZOMBIE_FIELDS,
    ZOMBIE_GAME_POSITION_GROUPS.zombie,
    origin,
  )
  applyPool(
    replica.shots,
    simulation.shots,
    candidate.shots,
    latest?.shots,
    ZOMBIE_GAME_SHOT_FIELDS,
    ZOMBIE_GAME_POSITION_GROUPS.shot,
    origin,
  )
  applyPool(
    replica.impacts,
    simulation.impactEvents,
    candidate.impacts,
    latest?.impacts,
    ZOMBIE_GAME_IMPACT_FIELDS,
    ZOMBIE_GAME_POSITION_GROUPS.impact,
    origin,
  )

  resetZombieEscapeAmbientHandoff(simulation.ambientHandoff)
  simulation.ambientHandoff.candidateCount = candidate.pendingAmbientNpcIndices.length
  for (let index = 0; index < candidate.pendingAmbientNpcIndices.length; index += 1) {
    const npcIndex = candidate.pendingAmbientNpcIndices[index]!
    simulation.ambientHandoff.candidateNpcIndex[index] = npcIndex
    simulation.ambientHandoff.candidateInstalledByNpcIndex[npcIndex] = 1
  }
  for (const zombie of candidate.zombies) {
    const previousZombie = latest?.zombies[replica.zombies.previousIndex[zombie.slot] ?? -1]
    if (
      zombie.health <= 0 &&
      (!previousZombie ||
        previousZombie.health > 0 ||
        previousZombie.generation !== zombie.generation)
    )
      replica.deathPresentationRevision += 1
    if (zombie.sourceNpcIndex >= 0)
      bindZombieEscapeAmbientHandoffOwnership(
        simulation.ambientHandoff,
        zombie.sourceNpcIndex,
        zombie.slot,
        simulation.zombies.pool.generation[zombie.slot]!,
      )
  }
  for (const shot of candidate.shots) {
    simulation.shots.hitTargetGeneration[shot.slot] = localTargetGeneration(
      replica,
      simulation,
      shot.hitTargetSlot,
      shot.hitTargetGeneration,
    )
    simulation.shots.lastPiercedTargetGeneration[shot.slot] = localTargetGeneration(
      replica,
      simulation,
      shot.lastPiercedTargetSlot,
      shot.lastPiercedTargetGeneration,
    )
    simulation.shots.hitWorldGeneration[shot.slot] =
      shot.hitWorldGeneration === candidate.worldGeneration
        ? simulation.collisionWorldGeneration
        : 0
  }
  for (const impact of candidate.impacts) {
    simulation.impactEvents.targetGeneration[impact.slot] = localTargetGeneration(
      replica,
      simulation,
      impact.targetSlot,
      impact.targetGeneration,
    )
    simulation.impactEvents.hitWorldGeneration[impact.slot] =
      impact.hitWorldGeneration === candidate.worldGeneration
        ? simulation.collisionWorldGeneration
        : 0
  }

  const self = candidate.self
  const player = simulation.player
  player.health = self.health
  player.ammo = self.ammo
  player.weaponIndex = self.weaponIndex
  player.weaponInventoryMask = self.weaponInventoryMask
  player.weaponAmmoByIndex.set(self.weaponAmmoByIndex)
  player.hitSlowSeconds = self.hitSlowSeconds
  player.hurtFlash = self.hurtFlash
  player.meleePhase = self.meleePhase
  player.meleePhaseSeconds = self.meleePhaseSeconds
  player.meleeSequence = self.meleeSequence
  player.meleeTargetSlot = self.meleeTargetSlot
  player.meleeTargetGeneration = localTargetGeneration(
    replica,
    simulation,
    self.meleeTargetSlot,
    self.meleeTargetGeneration,
  )
  simulation.nextShotVolleySequence = self.nextShotVolleySequence
  simulation.status = self.status
  simulation.kills = self.kills
  simulation.money = self.money
  simulation.nearbyPickupIndex =
    self.nearbyPickupIndex < simulation.weaponPickups.length ? self.nearbyPickupIndex : -1
  simulation.purchaseFeedback = self.purchaseFeedback
  simulation.weaponPurchaseCount = self.weaponPurchaseCount
  for (let index = 0; index < self.weaponPickupRespawnAtSeconds.length; index += 1)
    simulation.weaponPickupRespawnAtSeconds[index] =
      self.weaponPickupRespawnAtSeconds[index] ?? Number.POSITIVE_INFINITY
  simulation.phase = candidate.phase
  simulation.night = candidate.night
  simulation.phaseSecondsRemaining = candidate.phaseSecondsRemaining
  if (!latest) simulation.elapsedSeconds = candidate.elapsedSeconds
  simulation.waveSpawnRemaining = 0
  simulation.replacementSpawnRemaining = 0
  const destroyedChanged = replaceSet(
    simulation.destroyedObstacleIds,
    candidate.destroyedObstacleIds,
  )
  const passableChanged = replaceSet(simulation.passableObstacleIds, candidate.passableObstacleIds)
  if (destroyedChanged || passableChanged) simulation.obstacleRevision += 1
  simulation.obstacleHitFeedback.clear()
  for (const hit of candidate.obstacleHitFeedback)
    simulation.obstacleHitFeedback.set(hit.id, hit.amount)
  for (const event of candidate.audio) {
    if (latest && event.sequence > replica.audioSequence)
      emitZombieEscapeAudioEvent(
        simulation.audioEvents,
        event.kind,
        event.x - origin.x,
        event.y - origin.y,
        event.z - origin.z,
        event.subjectIndex,
      )
    replica.audioSequence = Math.max(replica.audioSequence, event.sequence)
  }
  return true
}

function fitsSimulation(
  replica: LandrushZombieGameReplica,
  simulation: ZombieEscapeSimulation,
  snapshot: ZombieGameSnapshot,
) {
  if (
    snapshot.self.weaponAmmoByIndex.length !== simulation.player.weaponAmmoByIndex.length ||
    snapshot.pendingAmbientNpcIndices.some(
      (index) => index >= simulation.ambientHandoff.slotByNpcIndex.length,
    ) ||
    snapshot.ambientNpcs.some(
      (row) => row.index >= simulation.ambientHandoff.slotByNpcIndex.length,
    ) ||
    snapshot.zombies.some((row) => row.slot >= simulation.zombies.pool.capacity) ||
    snapshot.shots.some(
      (row) =>
        row.slot >= simulation.shots.pool.capacity ||
        row.weaponIndex >= simulation.player.weaponAmmoByIndex.length,
    ) ||
    snapshot.impacts.some(
      (row) =>
        row.slot >= simulation.impactEvents.pool.capacity ||
        row.weaponIndex >= simulation.player.weaponAmmoByIndex.length,
    )
  )
    return false
  replica.variantCount.fill(0)
  for (const row of snapshot.zombies) {
    if (
      row.variant >= replica.variantCapacity.length ||
      row.sourceNpcIndex >= simulation.ambientHandoff.slotByNpcIndex.length
    )
      return false
    if (row.sourceNpcIndex >= 0 && simulation.variantByPoolSlot[row.sourceNpcIndex] !== row.variant)
      return false
    replica.variantCount[row.variant]! += 1
    if (replica.variantCount[row.variant]! > replica.variantCapacity[row.variant]!) return false
  }
  return true
}

function applyPool<Key extends string>(
  replica: PoolReplica,
  destination: Record<Key, NumericArray> & { pool: ZombieEscapeFixedPool },
  rows: readonly (Row & Record<Key, number>)[],
  previous: readonly (Row & Record<Key, number>)[] | undefined,
  fields: readonly Key[],
  positions: readonly (readonly (Key | null)[])[],
  origin: Origin,
) {
  const pool = destination.pool
  replica.previousIndex.fill(-1)
  if (previous)
    for (let index = 0; index < previous.length; index += 1)
      replica.previousIndex[previous[index]!.slot] = index
  pool.active.fill(0)
  pool.activeCount = rows.length
  for (const row of rows) {
    const slot = row.slot
    if (replica.wireGeneration[slot] !== row.generation) {
      // Renderer caches use local generations, which must not alias after a server epoch reset.
      pool.generation[slot] = pool.nextGeneration
      pool.nextGeneration = (pool.nextGeneration + 1) >>> 0 || 1
    }
    replica.wireGeneration[slot] = row.generation
    pool.active[slot] = 1
    for (const field of fields) destination[field][slot] = row[field]
    for (const keys of positions) {
      const [x, y, z] = keys
      if (x) destination[x][slot] = row[x] - origin.x
      if (y) destination[y][slot] = row[y] - origin.y
      if (z) destination[z][slot] = row[z] - origin.z
    }
  }
  for (let slot = 0; slot < pool.capacity; slot += 1)
    if (pool.active[slot] === 0) replica.wireGeneration[slot] = 0
}

function localTargetGeneration(
  replica: LandrushZombieGameReplica,
  simulation: ZombieEscapeSimulation,
  slot: number,
  generation: number,
) {
  return slot >= 0 && generation > 0 && replica.zombies.wireGeneration[slot] === generation
    ? simulation.zombies.pool.generation[slot]!
    : 0
}

function replaceSet(target: Set<string>, values: readonly string[]) {
  if (target.size === values.length && values.every((value) => target.has(value))) return false
  target.clear()
  for (const value of values) target.add(value)
  return true
}

export function presentLandrushZombieGameReplica(
  replica: LandrushZombieGameReplica,
  simulation: ZombieEscapeSimulation,
  nowMs: number,
  interpolationDelayMs = 100,
) {
  const latest = replica.latest
  const previous = replica.previous
  if (!latest || !Number.isFinite(nowMs) || !Number.isFinite(interpolationDelayMs)) return
  const elapsed = Math.min(1000, Math.max(0, nowMs - replica.receivedAtMs))
  const interval = previous ? latest.serverTime - previous.serverTime : 0
  const amount =
    interval > 0
      ? Math.max(
          0,
          Math.min(1, (interval + elapsed - Math.max(0, interpolationDelayMs)) / interval),
        )
      : 1
  const presentationOffsetSeconds = (elapsed - Math.max(0, interpolationDelayMs)) / 1000
  simulation.elapsedSeconds = Math.max(
    simulation.elapsedSeconds,
    latest.elapsedSeconds + presentationOffsetSeconds,
  )
  for (const row of latest.shots) {
    simulation.shots.travelAge[row.slot] =
      row.phase === 2 ? row.travelAge : Math.max(0, row.travelAge + presentationOffsetSeconds)
    simulation.shots.impactAge[row.slot] =
      row.phase === 2 ? Math.max(0, row.impactAge + presentationOffsetSeconds) : row.impactAge
  }
  for (const row of latest.impacts)
    simulation.impactEvents.age[row.slot] = Math.max(0, row.age + presentationOffsetSeconds)
  for (const row of latest.zombies) {
    if (row.health <= 0)
      simulation.zombies.deathPresentationSeconds[row.slot] = Math.max(
        0,
        row.deathPresentationSeconds - presentationOffsetSeconds,
      )
  }
  if (previous) {
    for (const npc of latest.ambientNpcs) {
      const before = previous.ambientNpcs[replica.ambientPreviousIndex[npc.index] ?? -1]
      const current = replica.ambientNpcs[npc.index]
      if (!before || !current) continue
      current.x = before.x + (npc.x - before.x) * amount
      current.y = before.y + (npc.y - before.y) * amount
      current.z = before.z + (npc.z - before.z) * amount
      current.yaw =
        before.yaw +
        Math.atan2(Math.sin(npc.yaw - before.yaw), Math.cos(npc.yaw - before.yaw)) * amount
      if (before.phase === npc.phase)
        current.locomotionPhase =
          before.locomotionPhase +
          Math.atan2(
            Math.sin(npc.locomotionPhase - before.locomotionPhase),
            Math.cos(npc.locomotionPhase - before.locomotionPhase),
          ) *
            amount
    }
    interpolatePool(
      simulation.zombies,
      replica.zombies,
      latest.zombies,
      previous.zombies,
      replica.origin,
      amount,
      true,
    )
    interpolatePool(
      simulation.shots,
      replica.shots,
      latest.shots,
      previous.shots,
      replica.origin,
      amount,
      false,
    )
  }
}

function interpolatePool<
  T extends Row & {
    x: number
    y: number
    z: number
    heading?: number
    health?: number
    phase?: number
    previousX?: number
    previousY?: number
    previousZ?: number
  },
>(
  destination: {
    x: Float32Array
    y: Float32Array
    z: Float32Array
    heading?: Float32Array
    previousX?: Float32Array
    previousY?: Float32Array
    previousZ?: Float32Array
  },
  replica: PoolReplica,
  latest: readonly T[],
  previous: readonly T[],
  origin: Origin,
  amount: number,
  rotate: boolean,
) {
  for (const row of latest) {
    const before = previous[replica.previousIndex[row.slot] ?? -1]
    if (
      !before ||
      before.generation !== row.generation ||
      before.phase !== row.phase ||
      (row.health !== undefined && row.health <= 0)
    )
      continue
    destination.x[row.slot] = before.x + (row.x - before.x) * amount - origin.x
    destination.y[row.slot] = before.y + (row.y - before.y) * amount - origin.y
    destination.z[row.slot] = before.z + (row.z - before.z) * amount - origin.z
    if (
      destination.previousX &&
      destination.previousY &&
      destination.previousZ &&
      before.previousX !== undefined &&
      before.previousY !== undefined &&
      before.previousZ !== undefined &&
      row.previousX !== undefined &&
      row.previousY !== undefined &&
      row.previousZ !== undefined
    ) {
      destination.previousX[row.slot] =
        before.previousX + (row.previousX - before.previousX) * amount - origin.x
      destination.previousY[row.slot] =
        before.previousY + (row.previousY - before.previousY) * amount - origin.y
      destination.previousZ[row.slot] =
        before.previousZ + (row.previousZ - before.previousZ) * amount - origin.z
    }
    if (
      rotate &&
      destination.heading &&
      before.heading !== undefined &&
      row.heading !== undefined
    ) {
      const difference = Math.atan2(
        Math.sin(row.heading - before.heading),
        Math.cos(row.heading - before.heading),
      )
      destination.heading[row.slot] = before.heading + difference * amount
    }
  }
}
