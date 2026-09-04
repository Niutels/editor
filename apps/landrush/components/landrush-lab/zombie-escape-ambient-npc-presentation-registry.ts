import type { ZombieGameAmbientNpc } from '@landrush/protocol/zombie-game'
import type {
  ZombieEscapeAmbientHandoffSource,
  ZombieEscapeAmbientHandoffState,
} from '@landrush/zombie-gameplay/zombie-escape-ambient-handoff'
import type { ZombieEscapeAmbientNpcSourceId } from '@landrush/zombie-gameplay/zombie-escape-zombie-roster'
import type { LandrushRobotShoulderTorchLightingState } from './landrush-robot-shoulder-torch'

export type ZombieEscapeAmbientNpcPresentationAdapter = Readonly<{
  capture: (source: ZombieEscapeAmbientHandoffSource, index: number) => boolean
}>

export type ZombieEscapeAmbientNpcPresentationSimulation = Readonly<{
  ambientHandoff: ZombieEscapeAmbientHandoffState
  paused: boolean
  variantByPoolSlot: Uint8Array
  zombies: Readonly<{
    attackCooldown: Float32Array
    deathPresentationSeconds: Float32Array
    heading: Float32Array
    health: Float32Array
    hitFlash: Float32Array
    hitImpulseX: Float32Array
    hitImpulseY: Float32Array
    hitImpulseZ: Float32Array
    hitReaction: Float32Array
    intent: Uint8Array
    pool: Readonly<{
      active: Uint8Array
      generation: Uint32Array
    }>
    runBlend: Float32Array
    spawnOrdinal: Uint32Array
    variant: Uint8Array
    vx: Float32Array
    vz: Float32Array
    x: Float32Array
    y: Float32Array
    z: Float32Array
  }>
}>

export type ZombieEscapeAmbientNpcPresentationRuntime = Readonly<{
  originX: number
  originZ: number
  readAuthorityAmbientNpc?: (index: number) => Readonly<ZombieGameAmbientNpc> | null
  readShoulderTorchLighting: () => Readonly<LandrushRobotShoulderTorchLightingState> | null
  readSimulation: () => ZombieEscapeAmbientNpcPresentationSimulation
}>

export type ZombieEscapeAmbientNpcPresentationRegistry = Readonly<{
  bindRuntime: (runtime: ZombieEscapeAmbientNpcPresentationRuntime) => () => void
  captureSource: () => ZombieEscapeAmbientHandoffSource
  getRegisteredCount: () => number
  readGroundY: () => number
  readRuntime: () => ZombieEscapeAmbientNpcPresentationRuntime | null
  register: (index: number, adapter: ZombieEscapeAmbientNpcPresentationAdapter) => () => void
  setGroundY: (groundY: number) => void
}>

export type ZombieEscapeAmbientNpcPresentationClaim = {
  generation: number
  slot: number
  valid: boolean
}

export function createZombieEscapeAmbientNpcPresentationRegistry(
  sourceNpcIds: readonly ZombieEscapeAmbientNpcSourceId[],
): ZombieEscapeAmbientNpcPresentationRegistry {
  const capacity = sourceNpcIds.length
  const adapters: Array<ZombieEscapeAmbientNpcPresentationAdapter | null> =
    Array(capacity).fill(null)
  const source: ZombieEscapeAmbientHandoffSource = {
    locomotionMode: new Uint8Array(capacity),
    locomotionPhase: new Float32Array(capacity),
    sourceNpcIds: Object.freeze([...sourceNpcIds]),
    valid: new Uint8Array(capacity),
    variant: new Uint8Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    yaw: new Float32Array(capacity),
    z: new Float32Array(capacity),
  }
  let groundY = 0
  let registeredCount = 0
  let boundRuntime: ZombieEscapeAmbientNpcPresentationRuntime | null = null

  return {
    bindRuntime(runtime) {
      boundRuntime = runtime
      return () => {
        if (boundRuntime === runtime) boundRuntime = null
      }
    },
    captureSource() {
      const simulation = boundRuntime?.readSimulation()
      for (let index = 0; index < capacity; index += 1) {
        source.valid[index] = 0
        source.variant[index] = simulation?.variantByPoolSlot[index] ?? 0
        const adapter = adapters[index]
        if (adapter?.capture(source, index)) {
          source.variant[index] = simulation?.variantByPoolSlot[index] ?? source.variant[index]!
          source.valid[index] = 1
        }
      }
      return source
    },
    getRegisteredCount: () => registeredCount,
    readGroundY: () => groundY,
    readRuntime: () => boundRuntime,
    register(index, adapter) {
      assertZombieEscapeAmbientNpcIndex(index, capacity)
      const previous = adapters[index]
      if (previous !== adapter) {
        if (previous === null) registeredCount += 1
        adapters[index] = adapter
      }
      return () => {
        if (adapters[index] !== adapter) return
        adapters[index] = null
        registeredCount -= 1
      }
    },
    setGroundY(nextGroundY) {
      groundY = Number.isFinite(nextGroundY) ? nextGroundY : 0
    },
  }
}

export function createZombieEscapeAmbientNpcPresentationClaim(): ZombieEscapeAmbientNpcPresentationClaim {
  return { generation: 0, slot: -1, valid: false }
}

export function resolveZombieEscapeAmbientNpcPresentationClaim(
  simulation: ZombieEscapeAmbientNpcPresentationSimulation,
  npcIndex: number,
  output: ZombieEscapeAmbientNpcPresentationClaim,
) {
  const { ambientHandoff, zombies } = simulation
  const slot = ambientHandoff.slotByNpcIndex[npcIndex] ?? -1
  const generation = ambientHandoff.generationByNpcIndex[npcIndex] ?? 0
  output.generation = generation
  output.slot = slot
  output.valid =
    slot >= 0 &&
    slot < zombies.pool.active.length &&
    zombies.pool.active[slot] !== 0 &&
    zombies.pool.generation[slot] === generation &&
    ambientHandoff.npcIndexBySlot[slot] === npcIndex
  return output
}

export function isZombieEscapeAmbientNpcHandoffCandidatePending(
  handoff: ZombieEscapeAmbientHandoffState,
  npcIndex: number,
) {
  for (let index = handoff.candidateCursor; index < handoff.candidateCount; index += 1) {
    if (handoff.candidateNpcIndex[index] === npcIndex) return true
  }
  return false
}

function assertZombieEscapeAmbientNpcIndex(index: number, capacity: number) {
  if (!Number.isInteger(index) || index < 0 || index >= capacity) {
    throw new Error(`Ambient NPC presentation index ${index} is outside capacity ${capacity}.`)
  }
}
