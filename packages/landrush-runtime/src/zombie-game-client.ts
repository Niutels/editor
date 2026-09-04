import {
  isZombieGameDoor,
  isZombieGameInput,
  isZombieGameReady,
  isZombieGameSnapshot,
  isZombieGameStatus,
  type ZombieGameInput,
  type ZombieGameSnapshot,
  type ZombieGameStatus,
} from '@landrush/protocol/zombie-game'

export type MultiplayerZombieGameScope = {
  roomId: string
  worldId: string | null
  playerId: string
  transportGeneration: number
}
export type MultiplayerZombieGameStatusObservation = {
  state: ZombieGameStatus
  transportGeneration: number
  receivedAtMs: number
}
export type MultiplayerZombieGameSnapshotObservation = {
  snapshot: ZombieGameSnapshot
  transportGeneration: number
  receivedAtMs: number
}
export type MultiplayerZombieGameInputIntent = Pick<
  ZombieGameInput,
  'aimAngle' | 'fire' | 'interactPressed' | 'weaponIndex' | 'muzzle'
>
export type MultiplayerZombieGameClient = ReturnType<typeof createMultiplayerZombieGameClient>

export function createMultiplayerZombieGameClient({
  enabled,
  readScope,
  send,
  now = () => performance.now(),
  onChange = () => {},
  unavailableReason = null,
}: {
  enabled: boolean
  readScope: () => MultiplayerZombieGameScope
  send: (message: unknown) => boolean
  now?: () => number
  onChange?: () => void
  unavailableReason?: string | null
}) {
  let supported = false
  let status: MultiplayerZombieGameStatusObservation | null = null
  let observation: MultiplayerZombieGameSnapshotObservation | null = null
  let sequence = 0
  let error: string | null = null
  function matchesScope(value: { roomId: string; worldId: string }, generation: number) {
    const scope = readScope()
    return (
      generation === scope.transportGeneration &&
      value.roomId === scope.roomId &&
      value.worldId === scope.worldId
    )
  }
  function ready() {
    return Boolean(
      enabled &&
        !unavailableReason &&
        supported &&
        status?.state.status === 'ready' &&
        observation &&
        matchesScope(status.state, status.transportGeneration) &&
        now() - observation.receivedAtMs <= 1000,
    )
  }
  function envelope() {
    if (!ready() || !status) return null
    return {
      schemaVersion: 1 as const,
      worldId: status.state.worldId,
      sessionId: status.state.sessionId,
      night: status.state.night,
      worldGeneration: status.state.worldGeneration,
      sequence: sequence + 1,
    }
  }
  return {
    enabled,
    getStatus: () => status,
    readSnapshot: () => observation,
    getError: () => unavailableReason ?? error,
    getLastSentSequence: () => sequence,
    ready,
    clear() {
      supported = false
      status = null
      observation = null
      sequence = 0
      error = null
      onChange()
    },
    acceptCapability(schemaVersion: unknown) {
      if (!enabled || unavailableReason) return false
      supported = schemaVersion === 1
      error = supported ? null : 'This server does not support shared Zombie gameplay.'
      onChange()
      return supported
    },
    requestBind() {
      const scope = readScope()
      return (
        enabled &&
        supported &&
        scope.worldId !== null &&
        send({ type: 'zombie-game-bind', schemaVersion: 1, worldId: scope.worldId })
      )
    },
    acceptStatus(candidate: unknown, transportGeneration: number) {
      if (
        !enabled ||
        !supported ||
        !isZombieGameStatus(candidate) ||
        !matchesScope(candidate, transportGeneration)
      )
        return false
      const current = status?.state
      if (
        current &&
        current.sessionId === candidate.sessionId &&
        (candidate.night < current.night || candidate.worldGeneration < current.worldGeneration)
      )
        return false
      const epochChanged =
        !current ||
        current.sessionId !== candidate.sessionId ||
        current.night !== candidate.night ||
        current.worldGeneration !== candidate.worldGeneration
      if (epochChanged) sequence = 0
      if (epochChanged || candidate.status !== 'ready') observation = null
      status = { state: candidate, transportGeneration, receivedAtMs: now() }
      error =
        candidate.status === 'error'
          ? (candidate.message ?? 'Shared Zombie server is unavailable.')
          : null
      onChange()
      return true
    },
    acceptSnapshot(candidate: unknown, transportGeneration: number) {
      const authority = status?.state
      if (
        !enabled ||
        !supported ||
        !authority ||
        authority.status !== 'ready' ||
        !isZombieGameSnapshot(candidate) ||
        !matchesScope(candidate, transportGeneration) ||
        candidate.self.playerId !== readScope().playerId ||
        candidate.sessionId !== authority.sessionId ||
        candidate.night !== authority.night ||
        candidate.worldGeneration !== authority.worldGeneration
      )
        return false
      const previous = observation?.snapshot
      if (
        previous &&
        (candidate.sequence <= previous.sequence ||
          candidate.tick < previous.tick ||
          candidate.serverTime < previous.serverTime ||
          candidate.self.lastInputSequence < previous.self.lastInputSequence)
      )
        return false
      observation = { snapshot: candidate, transportGeneration, receivedAtMs: now() }
      sequence = Math.max(sequence, candidate.self.lastInputSequence)
      onChange()
      return true
    },
    sendInput(intent: MultiplayerZombieGameInputIntent) {
      const scope = envelope()
      if (!scope || status?.state.night === 0 || observation?.snapshot.self.status !== 'playing')
        return false
      const message = { ...scope, ...intent, type: 'zombie-game-input' as const }
      if (!isZombieGameInput(message) || !send(message)) return false
      sequence = message.sequence
      return true
    },
    sendDoor(doorId: string, open: boolean) {
      const scope = envelope()
      if (!scope || observation?.snapshot.self.status !== 'playing') return false
      const message = { ...scope, type: 'zombie-game-door' as const, doorId, open }
      if (!isZombieGameDoor(message) || !send(message)) return false
      sequence = message.sequence
      return true
    },
    sendReady(ready: boolean) {
      const state = status?.state
      if (
        !enabled ||
        !supported ||
        !state ||
        !observation ||
        !matchesScope(state, status!.transportGeneration)
      )
        return false
      const message = {
        type: 'zombie-game-ready' as const,
        schemaVersion: 1 as const,
        worldId: state.worldId,
        sessionId: state.sessionId,
        night: state.night,
        worldGeneration: state.worldGeneration,
        phase: observation.snapshot.phase,
        ready,
      }
      return isZombieGameReady(message) && send(message)
    },
  }
}
