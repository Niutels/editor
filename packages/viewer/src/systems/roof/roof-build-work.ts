import type { AnyNodeId } from '@pascal-app/core'

const pendingRoofUpdates = new Set<AnyNodeId>()

export const roofBuildWorkQueue = {
  add(id: AnyNodeId) {
    pendingRoofUpdates.add(id)
  },
  clear() {
    pendingRoofUpdates.clear()
  },
  delete(id: AnyNodeId) {
    return pendingRoofUpdates.delete(id)
  },
  [Symbol.iterator]() {
    return pendingRoofUpdates[Symbol.iterator]()
  },
}

export function hasPendingRoofBuildWork() {
  return pendingRoofUpdates.size > 0
}
