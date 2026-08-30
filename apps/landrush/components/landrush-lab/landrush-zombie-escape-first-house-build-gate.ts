import { useSyncExternalStore } from 'react'

type LandrushZombieEscapeFirstHouseBuildGateSnapshot = Readonly<{
  enabled: boolean
  waitingOnHouse: boolean
}>

const INACTIVE_SNAPSHOT: LandrushZombieEscapeFirstHouseBuildGateSnapshot = {
  enabled: false,
  waitingOnHouse: false,
}

const listeners = new Set<() => void>()
let owner: symbol | null = null
let snapshot = INACTIVE_SNAPSHOT

export function publishLandrushZombieEscapeFirstHouseBuildGate(
  nextOwner: symbol,
  waitingOnHouse: boolean,
) {
  owner = nextOwner
  const nextSnapshot = { enabled: true, waitingOnHouse }
  if (
    snapshot.enabled === nextSnapshot.enabled &&
    snapshot.waitingOnHouse === nextSnapshot.waitingOnHouse
  ) {
    return
  }
  snapshot = nextSnapshot
  for (const listener of listeners) listener()
}

export function releaseLandrushZombieEscapeFirstHouseBuildGate(releasingOwner: symbol) {
  if (owner !== releasingOwner) return
  owner = null
  if (snapshot === INACTIVE_SNAPSHOT) return
  snapshot = INACTIVE_SNAPSHOT
  for (const listener of listeners) listener()
}

export function useLandrushZombieEscapeFirstHouseBuildGate() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return snapshot
}

function getServerSnapshot() {
  return INACTIVE_SNAPSHOT
}
