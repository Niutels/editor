export const ZOMBIE_ESCAPE_PLAYER_TRAIL_CAPACITY = 256
export const ZOMBIE_ESCAPE_PLAYER_TRAIL_SPACING_METERS = 0.5
export const ZOMBIE_ESCAPE_PLAYER_TRAIL_MINIMUM_TURN_DISTANCE_METERS = 0.18
export const ZOMBIE_ESCAPE_PLAYER_TRAIL_TURN_COSINE = Math.cos(Math.PI / 6)

export type ZombieEscapePlayerTrailPointInput = Readonly<{
  layerIndex: number
  regionIndex: number
  tick: number
  x: number
  y: number
  z: number
}>

export type ZombieEscapePlayerTrailPoint = {
  connectorIndex: number
  connectorTargetEnd: boolean
  layerIndex: number
  regionIndex: number
  sequence: number
  tick: number
  x: number
  y: number
  z: number
}

export type ZombieEscapePlayerTrail = {
  capacity: number
  connectorIndices: Int16Array
  connectorTargetEnds: Uint8Array
  count: number
  generation: number
  layerIndices: Int16Array
  newestSequence: number
  nextSequence: number
  regionIndices: Int32Array
  sequences: Uint32Array
  ticks: Uint32Array
  x: Float32Array
  y: Float32Array
  z: Float32Array
}

export function createZombieEscapePlayerTrail(
  capacity = ZOMBIE_ESCAPE_PLAYER_TRAIL_CAPACITY,
): ZombieEscapePlayerTrail {
  const normalizedCapacity = Math.max(2, Math.min(0x7fff, Math.trunc(capacity)))
  return {
    capacity: normalizedCapacity,
    connectorIndices: new Int16Array(normalizedCapacity).fill(-1),
    connectorTargetEnds: new Uint8Array(normalizedCapacity),
    count: 0,
    generation: 1,
    layerIndices: new Int16Array(normalizedCapacity).fill(-1),
    newestSequence: 0,
    nextSequence: 1,
    regionIndices: new Int32Array(normalizedCapacity).fill(-1),
    sequences: new Uint32Array(normalizedCapacity),
    ticks: new Uint32Array(normalizedCapacity),
    x: new Float32Array(normalizedCapacity),
    y: new Float32Array(normalizedCapacity),
    z: new Float32Array(normalizedCapacity),
  }
}

export function createZombieEscapePlayerTrailPoint(): ZombieEscapePlayerTrailPoint {
  return {
    connectorIndex: -1,
    connectorTargetEnd: false,
    layerIndex: -1,
    regionIndex: -1,
    sequence: 0,
    tick: 0,
    x: 0,
    y: 0,
    z: 0,
  }
}

export function resetZombieEscapePlayerTrail(trail: ZombieEscapePlayerTrail) {
  trail.count = 0
  trail.generation = (trail.generation + 1) >>> 0 || 1
  trail.newestSequence = 0
  trail.nextSequence = 1
}

export function getZombieEscapePlayerTrailOldestSequence(trail: ZombieEscapePlayerTrail) {
  return trail.count > 0 ? trail.newestSequence - trail.count + 1 : 0
}

export function readZombieEscapePlayerTrailPoint(
  trail: ZombieEscapePlayerTrail,
  sequence: number,
  output: ZombieEscapePlayerTrailPoint,
) {
  if (!Number.isInteger(sequence) || sequence <= 0 || trail.count <= 0) return false
  const oldestSequence = getZombieEscapePlayerTrailOldestSequence(trail)
  if (sequence < oldestSequence || sequence > trail.newestSequence) return false
  const index = (sequence - 1) % trail.capacity
  if (trail.sequences[index] !== sequence) return false
  output.connectorIndex = trail.connectorIndices[index]!
  output.connectorTargetEnd = trail.connectorTargetEnds[index] !== 0
  output.layerIndex = trail.layerIndices[index]!
  output.regionIndex = trail.regionIndices[index]!
  output.sequence = sequence
  output.tick = trail.ticks[index]!
  output.x = trail.x[index]!
  output.y = trail.y[index]!
  output.z = trail.z[index]!
  return true
}

export function appendZombieEscapePlayerTrailPoint(
  trail: ZombieEscapePlayerTrail,
  input: ZombieEscapePlayerTrailPointInput,
) {
  if (
    !Number.isFinite(input.x) ||
    !Number.isFinite(input.y) ||
    !Number.isFinite(input.z) ||
    !Number.isInteger(input.layerIndex) ||
    !Number.isInteger(input.regionIndex)
  ) {
    return 0
  }
  const sequence = trail.nextSequence
  const index = (sequence - 1) % trail.capacity
  trail.connectorIndices[index] = -1
  trail.connectorTargetEnds[index] = 0
  trail.layerIndices[index] = input.layerIndex
  trail.regionIndices[index] = input.regionIndex
  trail.sequences[index] = sequence
  trail.ticks[index] = input.tick >>> 0
  trail.x[index] = input.x
  trail.y[index] = input.y
  trail.z[index] = input.z
  trail.count = Math.min(trail.capacity, trail.count + 1)
  trail.newestSequence = sequence
  trail.nextSequence = sequence + 1
  return sequence
}

export function recordZombieEscapePlayerTrailPoint(
  trail: ZombieEscapePlayerTrail,
  input: ZombieEscapePlayerTrailPointInput,
  force = false,
) {
  if (trail.count <= 0) return appendZombieEscapePlayerTrailPoint(trail, input)
  const newestIndex = (trail.newestSequence - 1) % trail.capacity
  const offsetX = input.x - trail.x[newestIndex]!
  const offsetY = input.y - trail.y[newestIndex]!
  const offsetZ = input.z - trail.z[newestIndex]!
  const distanceSquared = offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ
  const topologyChanged =
    input.layerIndex !== trail.layerIndices[newestIndex] ||
    input.regionIndex !== trail.regionIndices[newestIndex]
  const spaced = distanceSquared >= ZOMBIE_ESCAPE_PLAYER_TRAIL_SPACING_METERS ** 2
  let turned = false
  if (!force && !topologyChanged && !spaced && trail.count >= 2) {
    const previousSequence = trail.newestSequence - 1
    const previousIndex = (previousSequence - 1) % trail.capacity
    if (trail.sequences[previousIndex] === previousSequence) {
      const previousX = trail.x[newestIndex]! - trail.x[previousIndex]!
      const previousY = trail.y[newestIndex]! - trail.y[previousIndex]!
      const previousZ = trail.z[newestIndex]! - trail.z[previousIndex]!
      const previousLength = Math.hypot(previousX, previousY, previousZ)
      const nextLength = Math.sqrt(distanceSquared)
      turned =
        previousLength >= ZOMBIE_ESCAPE_PLAYER_TRAIL_MINIMUM_TURN_DISTANCE_METERS &&
        nextLength >= ZOMBIE_ESCAPE_PLAYER_TRAIL_MINIMUM_TURN_DISTANCE_METERS &&
        (previousX * offsetX + previousY * offsetY + previousZ * offsetZ) /
          (previousLength * nextLength) <=
          ZOMBIE_ESCAPE_PLAYER_TRAIL_TURN_COSINE
    }
  }
  return force || topologyChanged || spaced || turned
    ? appendZombieEscapePlayerTrailPoint(trail, input)
    : 0
}

export function setZombieEscapePlayerTrailOutgoingConnector(
  trail: ZombieEscapePlayerTrail,
  sequence: number,
  connectorIndex: number,
  connectorTargetEnd: boolean,
) {
  if (
    !Number.isInteger(connectorIndex) ||
    connectorIndex < 0 ||
    sequence < getZombieEscapePlayerTrailOldestSequence(trail) ||
    sequence > trail.newestSequence
  ) {
    return false
  }
  const index = (sequence - 1) % trail.capacity
  if (trail.sequences[index] !== sequence) return false
  trail.connectorIndices[index] = connectorIndex
  trail.connectorTargetEnds[index] = connectorTargetEnd ? 1 : 0
  return true
}
