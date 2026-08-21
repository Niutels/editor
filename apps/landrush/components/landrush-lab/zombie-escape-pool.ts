export type ZombieEscapeFixedPool = {
  active: Uint8Array
  activeCount: number
  capacity: number
  cursor: number
  generation: Uint32Array
  nextGeneration: number
}

export function createZombieEscapeFixedPool(capacity: number): ZombieEscapeFixedPool {
  const resolvedCapacity = Math.max(1, Math.trunc(capacity))
  return {
    active: new Uint8Array(resolvedCapacity),
    activeCount: 0,
    capacity: resolvedCapacity,
    cursor: 0,
    generation: new Uint32Array(resolvedCapacity),
    nextGeneration: 1,
  }
}

export function acquireZombieEscapePoolSlot(pool: ZombieEscapeFixedPool) {
  let slot = pool.cursor
  for (let offset = 0; offset < pool.capacity; offset += 1) {
    const candidate = (pool.cursor + offset) % pool.capacity
    if (pool.active[candidate] === 0) {
      slot = candidate
      pool.active[candidate] = 1
      pool.activeCount += 1
      pool.cursor = (candidate + 1) % pool.capacity
      pool.generation[candidate] = pool.nextGeneration
      pool.nextGeneration = (pool.nextGeneration + 1) >>> 0 || 1
      return candidate
    }
  }

  pool.cursor = (slot + 1) % pool.capacity
  pool.generation[slot] = pool.nextGeneration
  pool.nextGeneration = (pool.nextGeneration + 1) >>> 0 || 1
  return slot
}

export function releaseZombieEscapePoolSlot(pool: ZombieEscapeFixedPool, slot: number) {
  if (slot < 0 || slot >= pool.capacity || pool.active[slot] === 0) return false
  pool.active[slot] = 0
  pool.activeCount -= 1
  if (pool.activeCount === 0) pool.cursor = 0
  return true
}

export function resetZombieEscapeFixedPool(pool: ZombieEscapeFixedPool) {
  pool.active.fill(0)
  pool.generation.fill(0)
  pool.activeCount = 0
  pool.cursor = 0
}
