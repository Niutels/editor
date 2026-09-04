import type { ZombieEscapeGameStatus } from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { useSyncExternalStore } from 'react'
import { reconcileLandrushDestroyedFurnitureIds } from './landrush-destroyed-furniture-collider-state'

export type LandrushZombieEscapePlayerPresentationSnapshot = Readonly<{
  destroyedFurnitureIds: ReadonlySet<string>
  interactionActionable: boolean
  status: ZombieEscapeGameStatus
}>

export type LandrushZombieEscapePlayerPresentationStore = Readonly<{
  getSnapshot: () => LandrushZombieEscapePlayerPresentationSnapshot
  setDestroyedFurnitureIds: (nodeIds: ReadonlySet<string>) => boolean
  setInteractionActionable: (actionable: boolean) => boolean
  setStatus: (status: ZombieEscapeGameStatus) => boolean
  subscribe: (listener: () => void) => () => void
}>

export function createLandrushZombieEscapePlayerPresentationStore(): LandrushZombieEscapePlayerPresentationStore {
  let snapshot: LandrushZombieEscapePlayerPresentationSnapshot = {
    destroyedFurnitureIds: new Set(),
    interactionActionable: false,
    status: 'playing',
  }
  const listeners = new Set<() => void>()

  const emit = () => {
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => snapshot,
    setDestroyedFurnitureIds(nodeIds) {
      const destroyedFurnitureIds = reconcileLandrushDestroyedFurnitureIds(
        snapshot.destroyedFurnitureIds,
        nodeIds,
      )
      if (destroyedFurnitureIds === snapshot.destroyedFurnitureIds) return false
      snapshot = { ...snapshot, destroyedFurnitureIds }
      emit()
      return true
    },
    setInteractionActionable(interactionActionable) {
      if (interactionActionable === snapshot.interactionActionable) return false
      snapshot = { ...snapshot, interactionActionable }
      emit()
      return true
    },
    setStatus(status) {
      if (status === snapshot.status) return false
      snapshot = { ...snapshot, status }
      emit()
      return true
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function useLandrushZombieEscapePlayerPresentation(
  store: LandrushZombieEscapePlayerPresentationStore,
) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
