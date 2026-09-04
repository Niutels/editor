import type {
  MultiplayerZombieGameClient,
  MultiplayerZombieGameInputIntent,
} from '@landrush/runtime'
import type { ZombieEscapeSimulation } from '@landrush/zombie-gameplay/zombie-escape-simulation'
import {
  applyLandrushZombieGameSnapshot,
  createLandrushZombieGameReplica,
  type LandrushZombieGameReplica,
  presentLandrushZombieGameReplica,
  resetLandrushZombieGameReplicaScope,
} from './landrush-zombie-game-replica'

export function createLandrushZombieGameController(
  client: MultiplayerZombieGameClient,
  simulation: ZombieEscapeSimulation,
  origin: Readonly<{ x: number; y: number; z: number }>,
) {
  let replica: LandrushZombieGameReplica | null = null
  let error: string | null = null
  let requestedWeapon = simulation.player.weaponIndex
  let pendingWeaponSequence: number | null = null
  let pendingInteractionSequence: number | null = null
  let sentAt = Number.NEGATIVE_INFINITY
  let sentFire = false
  let changed = false
  let readyScope: {
    sessionId: string
    night: number
    worldGeneration: number
    transportGeneration: number
    phase: string
    ready: boolean
  } | null = null
  function publishReady(ready: boolean) {
    const status = client.getStatus()
    const observation = client.readSnapshot()
    if (!status || !observation) {
      readyScope = null
      return
    }
    const state = status.state
    const phase = observation.snapshot.phase
    if (
      readyScope?.sessionId === state.sessionId &&
      readyScope.night === state.night &&
      readyScope.worldGeneration === state.worldGeneration &&
      readyScope.transportGeneration === status.transportGeneration &&
      readyScope.phase === phase &&
      readyScope.ready === ready
    )
      return
    if (client.sendReady(ready))
      readyScope = {
        sessionId: state.sessionId,
        night: state.night,
        worldGeneration: state.worldGeneration,
        transportGeneration: status.transportGeneration,
        phase,
        ready,
      }
  }
  return {
    getReplica: () => replica,
    getDeathPresentationRevision: () => replica?.deathPresentationRevision ?? 0,
    getError: () => error ?? client.getError(),
    changed: () => changed,
    update(
      nowMs: number,
      worldReady: boolean,
      presentationReady = worldReady,
      presentationPhase?: ZombieEscapeSimulation['phase'],
    ) {
      changed = false
      const observation = client.readSnapshot()
      const status = client.getStatus()
      if (!worldReady || !client.ready() || !observation || !status) {
        publishReady(false)
        return false
      }
      const snapshot = observation.snapshot
      const scope = replica?.scope
      if (
        !scope ||
        scope.roomId !== status.state.roomId ||
        scope.worldId !== status.state.worldId ||
        scope.playerId !== snapshot.self.playerId ||
        scope.sessionId !== status.state.sessionId ||
        scope.night !== status.state.night ||
        scope.worldGeneration !== status.state.worldGeneration ||
        scope.transportGeneration !== status.transportGeneration
      ) {
        const next = {
          roomId: status.state.roomId,
          worldId: status.state.worldId,
          sessionId: status.state.sessionId,
          night: status.state.night,
          worldGeneration: status.state.worldGeneration,
          transportGeneration: status.transportGeneration,
          playerId: snapshot.self.playerId,
        }
        if (replica) resetLandrushZombieGameReplicaScope(replica, simulation, next)
        else replica = createLandrushZombieGameReplica(simulation, next)
        requestedWeapon = snapshot.self.weaponIndex
        pendingWeaponSequence = null
        pendingInteractionSequence = null
        sentAt = Number.NEGATIVE_INFINITY
        sentFire = false
      }
      if (replica!.latest !== snapshot) {
        if (
          !applyLandrushZombieGameSnapshot(replica!, simulation, snapshot, {
            receivedAtMs: observation.receivedAtMs,
            transportGeneration: observation.transportGeneration,
            origin,
          })
        ) {
          error = 'The shared Zombie snapshot does not match this prepared world.'
          publishReady(false)
          return false
        }
        error = null
        changed = true
        if (
          pendingWeaponSequence !== null &&
          snapshot.self.lastInputSequence >= pendingWeaponSequence
        )
          pendingWeaponSequence = null
        if (pendingWeaponSequence === null) requestedWeapon = snapshot.self.weaponIndex
        if (
          pendingInteractionSequence !== null &&
          snapshot.self.lastInputSequence >= pendingInteractionSequence
        )
          pendingInteractionSequence = null
      }
      presentLandrushZombieGameReplica(replica!, simulation, nowMs)
      publishReady(
        presentationReady &&
          (presentationPhase === undefined || presentationPhase === snapshot.phase),
      )
      return true
    },
    cycleWeapon(direction: -1 | 1) {
      if (!client.ready() || simulation.phase !== 'night' || simulation.status !== 'playing')
        return false
      const length = simulation.player.weaponAmmoByIndex.length
      for (let offset = 1; offset < length; offset += 1) {
        const index = (requestedWeapon + direction * offset + length) % length
        if ((simulation.player.weaponInventoryMask & (1 << index)) === 0) continue
        requestedWeapon = index
        pendingWeaponSequence = Number.POSITIVE_INFINITY
        sentAt = Number.NEGATIVE_INFINITY
        return true
      }
      return false
    },
    send(nowMs: number, intent: Omit<MultiplayerZombieGameInputIntent, 'weaponIndex'>) {
      if (
        error ||
        !client.ready() ||
        simulation.phase !== 'night' ||
        simulation.status !== 'playing'
      )
        return false
      const interactPressed = intent.interactPressed && pendingInteractionSequence === null
      if (!interactPressed && intent.fire === sentFire && nowMs - sentAt < 50) return false
      if (!client.sendInput({ ...intent, interactPressed, weaponIndex: requestedWeapon }))
        return false
      if (interactPressed) pendingInteractionSequence = client.getLastSentSequence()
      if (pendingWeaponSequence === Number.POSITIVE_INFINITY)
        pendingWeaponSequence = client.getLastSentSequence()
      sentAt = nowMs
      sentFire = intent.fire
      return true
    },
  }
}
