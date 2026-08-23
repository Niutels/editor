import { disposeObject3DResources } from '@pascal-app/viewer'
import type { Group } from 'three'

export function disposeCabinetGhostResources(ghost: Group, pool: Group[]) {
  pool.length = 0
  disposeObject3DResources(ghost)
}

export function ownCabinetGhostResources(ghost: Group) {
  const pool: Group[] = []
  let disposed = false

  return {
    dispose() {
      if (disposed) return
      disposed = true
      disposeCabinetGhostResources(ghost, pool)
    },
    ghost,
    pool,
  }
}
