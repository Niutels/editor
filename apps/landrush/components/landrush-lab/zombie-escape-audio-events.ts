export const ZOMBIE_ESCAPE_AUDIO_EVENT_KIND = {
  enemyHit: 1,
  enemyKilled: 2,
  environmentImpact: 3,
  meleeSwing: 4,
  playerHurt: 5,
  playerKilled: 6,
  purchaseDenied: 7,
  shotFired: 8,
  weaponPurchased: 9,
} as const

export type ZombieEscapeAudioEventKind =
  (typeof ZOMBIE_ESCAPE_AUDIO_EVENT_KIND)[keyof typeof ZOMBIE_ESCAPE_AUDIO_EVENT_KIND]

export type ZombieEscapeAudioEventRing = {
  capacity: number
  kind: Uint8Array
  sequence: Float64Array
  subjectIndex: Uint8Array
  writeSequence: number
  x: Float32Array
  y: Float32Array
  z: Float32Array
}

export type ZombieEscapeAudioEventVisitor = (
  events: ZombieEscapeAudioEventRing,
  slot: number,
) => void

export function createZombieEscapeAudioEventRing(capacity = 128): ZombieEscapeAudioEventRing {
  const resolvedCapacity = Math.max(1, Math.trunc(capacity))
  return {
    capacity: resolvedCapacity,
    kind: new Uint8Array(resolvedCapacity),
    sequence: new Float64Array(resolvedCapacity),
    subjectIndex: new Uint8Array(resolvedCapacity),
    writeSequence: 0,
    x: new Float32Array(resolvedCapacity),
    y: new Float32Array(resolvedCapacity),
    z: new Float32Array(resolvedCapacity),
  }
}

export function emitZombieEscapeAudioEvent(
  events: ZombieEscapeAudioEventRing,
  kind: ZombieEscapeAudioEventKind,
  x: number,
  y: number,
  z: number,
  subjectIndex = 0,
) {
  const sequence = events.writeSequence + 1
  const slot = (sequence - 1) % events.capacity
  events.writeSequence = sequence
  events.kind[slot] = kind
  events.sequence[slot] = sequence
  events.subjectIndex[slot] = subjectIndex
  events.x[slot] = x
  events.y[slot] = y
  events.z[slot] = z
  return sequence
}

export function visitZombieEscapeAudioEventsAfter(
  events: ZombieEscapeAudioEventRing,
  afterSequence: number,
  visitor: ZombieEscapeAudioEventVisitor,
) {
  const latestSequence = events.writeSequence
  const firstAvailableSequence = Math.max(1, latestSequence - events.capacity + 1)
  const firstSequence = Math.max(firstAvailableSequence, Math.trunc(afterSequence) + 1)
  for (let sequence = firstSequence; sequence <= latestSequence; sequence += 1) {
    const slot = (sequence - 1) % events.capacity
    if (events.sequence[slot] === sequence) visitor(events, slot)
  }
  return latestSequence
}
