import {
  ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS,
  type ZombieEscapeAmbientNpcSourceId,
} from './zombie-escape-zombie-roster'

export const ZOMBIE_ESCAPE_AMBIENT_HANDOFF_LOCOMOTION = {
  idle: 0,
  walk: 1,
  run: 2,
} as const

export type ZombieEscapeAmbientHandoffLocomotion =
  (typeof ZOMBIE_ESCAPE_AMBIENT_HANDOFF_LOCOMOTION)[keyof typeof ZOMBIE_ESCAPE_AMBIENT_HANDOFF_LOCOMOTION]

export const ZOMBIE_ESCAPE_AMBIENT_HANDOFF_MAXIMUM_ANCHOR_ATTEMPTS = 3

export type ZombieEscapeAmbientHandoffSource = Readonly<{
  locomotionMode: Uint8Array
  locomotionPhase: Float32Array
  sourceNpcIds: readonly ZombieEscapeAmbientNpcSourceId[]
  valid: Uint8Array
  variant: Uint8Array
  x: Float32Array
  y: Float32Array
  yaw: Float32Array
  z: Float32Array
}>

export type ZombieEscapeAmbientHandoffState = {
  candidateAnchorAttempts: Uint8Array
  candidateCount: number
  candidateCursor: number
  candidateInstalledByNpcIndex: Uint8Array
  candidateLocomotionMode: Uint8Array
  candidateLocomotionPhase: Float32Array
  candidateNpcIndex: Uint8Array
  candidateVariant: Uint8Array
  candidateX: Float32Array
  candidateY: Float32Array
  candidateYaw: Float32Array
  candidateZ: Float32Array
  generationByNpcIndex: Uint32Array
  npcIndexBySlot: Int8Array
  slotByNpcIndex: Int16Array
}

export function createZombieEscapeAmbientHandoffState(
  zombieCapacity: number,
): ZombieEscapeAmbientHandoffState {
  const npcCapacity = ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS.length
  return {
    candidateAnchorAttempts: new Uint8Array(npcCapacity),
    candidateCount: 0,
    candidateCursor: 0,
    candidateInstalledByNpcIndex: new Uint8Array(npcCapacity),
    candidateLocomotionMode: new Uint8Array(npcCapacity),
    candidateLocomotionPhase: new Float32Array(npcCapacity),
    candidateNpcIndex: new Uint8Array(npcCapacity),
    candidateVariant: new Uint8Array(npcCapacity),
    candidateX: new Float32Array(npcCapacity),
    candidateY: new Float32Array(npcCapacity),
    candidateYaw: new Float32Array(npcCapacity),
    candidateZ: new Float32Array(npcCapacity),
    generationByNpcIndex: new Uint32Array(npcCapacity),
    npcIndexBySlot: new Int8Array(Math.max(1, Math.trunc(zombieCapacity))).fill(-1),
    slotByNpcIndex: new Int16Array(npcCapacity).fill(-1),
  }
}

export function installZombieEscapeAmbientHandoffSource(
  handoff: ZombieEscapeAmbientHandoffState,
  source: ZombieEscapeAmbientHandoffSource,
  variantByPoolSlot: Uint8Array,
) {
  clearZombieEscapeAmbientHandoffCandidates(handoff)
  const npcCapacity = handoff.slotByNpcIndex.length
  if (
    source.sourceNpcIds.length !== npcCapacity ||
    source.valid.length !== npcCapacity ||
    source.variant.length !== npcCapacity ||
    source.x.length !== npcCapacity ||
    source.y.length !== npcCapacity ||
    source.z.length !== npcCapacity ||
    source.yaw.length !== npcCapacity ||
    source.locomotionMode.length !== npcCapacity ||
    source.locomotionPhase.length !== npcCapacity ||
    variantByPoolSlot.length < npcCapacity
  ) {
    return 0
  }
  for (let sourceIndex = 0; sourceIndex < source.sourceNpcIds.length; sourceIndex += 1) {
    const npcIndex = sourceIndex
    const locomotionMode = source.locomotionMode[sourceIndex]
    if (
      source.sourceNpcIds[sourceIndex] !== ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS[npcIndex] ||
      source.valid[sourceIndex] === 0 ||
      source.variant[sourceIndex] !== variantByPoolSlot[npcIndex] ||
      (locomotionMode !== ZOMBIE_ESCAPE_AMBIENT_HANDOFF_LOCOMOTION.idle &&
        locomotionMode !== ZOMBIE_ESCAPE_AMBIENT_HANDOFF_LOCOMOTION.walk &&
        locomotionMode !== ZOMBIE_ESCAPE_AMBIENT_HANDOFF_LOCOMOTION.run) ||
      !Number.isFinite(source.x[sourceIndex]) ||
      !Number.isFinite(source.y[sourceIndex]) ||
      !Number.isFinite(source.z[sourceIndex]) ||
      !Number.isFinite(source.yaw[sourceIndex]) ||
      !Number.isFinite(source.locomotionPhase[sourceIndex])
    ) {
      return 0
    }
  }
  for (let sourceIndex = 0; sourceIndex < source.sourceNpcIds.length; sourceIndex += 1) {
    const npcIndex = sourceIndex
    handoff.candidateInstalledByNpcIndex[npcIndex] = 1
    handoff.candidateNpcIndex[npcIndex] = npcIndex
    handoff.candidateVariant[npcIndex] = variantByPoolSlot[npcIndex]!
    handoff.candidateX[npcIndex] = source.x[sourceIndex]!
    handoff.candidateY[npcIndex] = source.y[sourceIndex]!
    handoff.candidateZ[npcIndex] = source.z[sourceIndex]!
    handoff.candidateYaw[npcIndex] = source.yaw[sourceIndex]!
    handoff.candidateLocomotionMode[npcIndex] = source.locomotionMode[sourceIndex]!
    handoff.candidateLocomotionPhase[npcIndex] = source.locomotionPhase[sourceIndex]!
  }
  handoff.candidateCount = npcCapacity
  return handoff.candidateCount
}

function clearZombieEscapeAmbientHandoffCandidates(handoff: ZombieEscapeAmbientHandoffState) {
  handoff.candidateAnchorAttempts.fill(0)
  handoff.candidateInstalledByNpcIndex.fill(0)
  handoff.candidateCount = 0
  handoff.candidateCursor = 0
}

export function clearZombieEscapeAmbientHandoffOwnership(handoff: ZombieEscapeAmbientHandoffState) {
  handoff.generationByNpcIndex.fill(0)
  handoff.npcIndexBySlot.fill(-1)
  handoff.slotByNpcIndex.fill(-1)
}

export function resetZombieEscapeAmbientHandoff(handoff: ZombieEscapeAmbientHandoffState) {
  clearZombieEscapeAmbientHandoffCandidates(handoff)
  clearZombieEscapeAmbientHandoffOwnership(handoff)
}

export function clearZombieEscapeAmbientHandoffSlotOwnership(
  handoff: ZombieEscapeAmbientHandoffState,
  slot: number,
) {
  if (slot < 0 || slot >= handoff.npcIndexBySlot.length) return false
  const npcIndex = handoff.npcIndexBySlot[slot]!
  handoff.npcIndexBySlot[slot] = -1
  if (npcIndex < 0 || npcIndex >= handoff.slotByNpcIndex.length) return false
  if (handoff.slotByNpcIndex[npcIndex] === slot) {
    handoff.slotByNpcIndex[npcIndex] = -1
    handoff.generationByNpcIndex[npcIndex] = 0
  }
  return true
}

export function bindZombieEscapeAmbientHandoffOwnership(
  handoff: ZombieEscapeAmbientHandoffState,
  npcIndex: number,
  slot: number,
  generation: number,
) {
  if (
    npcIndex < 0 ||
    npcIndex >= handoff.slotByNpcIndex.length ||
    slot < 0 ||
    slot >= handoff.npcIndexBySlot.length ||
    generation <= 0
  ) {
    return false
  }
  const previousSlot = handoff.slotByNpcIndex[npcIndex]!
  if (previousSlot >= 0 && previousSlot < handoff.npcIndexBySlot.length) {
    handoff.npcIndexBySlot[previousSlot] = -1
  }
  clearZombieEscapeAmbientHandoffSlotOwnership(handoff, slot)
  handoff.generationByNpcIndex[npcIndex] = generation >>> 0
  handoff.npcIndexBySlot[slot] = npcIndex
  handoff.slotByNpcIndex[npcIndex] = slot
  return true
}
