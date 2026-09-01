export const ZOMBIE_ESCAPE_DETAILED_ZOMBIE_CAPACITY = 16
export const ZOMBIE_ESCAPE_DETAILED_ROOT_CAPACITY_PER_VARIANT = 2
export const ZOMBIE_ESCAPE_DETAILED_ROOT_CAPACITY = 20

const ZOMBIE_ESCAPE_DETAILED_MINIMUM_RESIDENCY_SECONDS = 0.75
const ZOMBIE_ESCAPE_DETAILED_HIT_RESIDENCY_SECONDS = 0.5
const ZOMBIE_ESCAPE_DETAILED_DISTANCE_HYSTERESIS_METERS = 1.25

export type ZombieEscapeVisualLodCounts = {
  activeZombieCount: number
  detailedActiveCount: number
  eligibleActiveCount: number
  instancedActiveCount: number
  maximumVariantDetailedCount: number
  reactingDetailedCount: number
  selectionChangeCount: number
}

export type ZombieEscapeVisualLodState = {
  capacity: number
  counts: ZombieEscapeVisualLodCounts
  distance: Float64Array
  lastElapsedSeconds: number
  nextSelected: Uint8Array
  reacting: Uint8Array
  residencyUntilSeconds: Float64Array
  selected: Uint8Array
  selectedGeneration: Uint32Array
  variantCandidates: Int32Array
  variantCounts: Uint8Array
  variantCount: number
}

export type ZombieEscapePresentationLodDebugSnapshot = {
  activeMixerCount: number
  activeMixersByVariant: Uint8Array
  activeZombieCount: number
  allocatedRootCount: number
  allocatedRootsByVariant: Uint8Array
  authoredInstancedActiveByVariant: Uint16Array
  authoredInstancedActiveCount: number
  authoredInstancedBatchCount: number
  authoredInstancedBatchesByVariant: Uint8Array
  detailedActiveCount: number
  detailedCapacity: number
  fallbackCount: number
  instancedActiveCount: number
  rootCapacity: number
  unpresentedActiveCount: number
}

export type ZombieEscapeVisualLodInput = {
  active: Uint8Array
  elapsedSeconds: number
  generation: Uint32Array
  hitFlash: Float32Array
  hitReaction: Float32Array
  observerX: number
  observerZ: number
  readyVariants: ReadonlySet<number>
  variant: Uint8Array
  x: Float32Array
  z: Float32Array
}

export function createZombieEscapeVisualLodState(
  capacity: number,
  variantCount: number,
): ZombieEscapeVisualLodState {
  if (!(Number.isSafeInteger(capacity) && capacity >= 1)) {
    throw new Error(`Zombie visual LOD capacity must be a positive integer; received ${capacity}.`)
  }
  if (!(Number.isSafeInteger(variantCount) && variantCount >= 1 && variantCount <= 255)) {
    throw new Error(
      `Zombie visual LOD variant count must be an integer from 1 to 255; received ${variantCount}.`,
    )
  }
  return {
    capacity,
    counts: {
      activeZombieCount: 0,
      detailedActiveCount: 0,
      eligibleActiveCount: 0,
      instancedActiveCount: 0,
      maximumVariantDetailedCount: 0,
      reactingDetailedCount: 0,
      selectionChangeCount: 0,
    },
    distance: new Float64Array(capacity),
    lastElapsedSeconds: 0,
    nextSelected: new Uint8Array(capacity),
    reacting: new Uint8Array(capacity),
    residencyUntilSeconds: new Float64Array(capacity),
    selected: new Uint8Array(capacity),
    selectedGeneration: new Uint32Array(capacity),
    variantCandidates: new Int32Array(
      variantCount * ZOMBIE_ESCAPE_DETAILED_ROOT_CAPACITY_PER_VARIANT,
    ).fill(-1),
    variantCounts: new Uint8Array(variantCount),
    variantCount,
  }
}

export function updateZombieEscapeVisualLod(
  state: ZombieEscapeVisualLodState,
  input: ZombieEscapeVisualLodInput,
) {
  assertZombieEscapeVisualLodInputCapacity(state.capacity, input)
  const elapsedSeconds = Number.isFinite(input.elapsedSeconds)
    ? Math.max(0, input.elapsedSeconds)
    : 0
  if (elapsedSeconds < state.lastElapsedSeconds) {
    state.selected.fill(0)
    state.residencyUntilSeconds.fill(0)
  }
  state.lastElapsedSeconds = elapsedSeconds
  state.nextSelected.fill(0)
  state.reacting.fill(0)
  state.variantCandidates.fill(-1)
  state.variantCounts.fill(0)

  let activeZombieCount = 0
  let eligibleActiveCount = 0
  for (let slot = 0; slot < state.capacity; slot += 1) {
    if (input.active[slot] !== 0) activeZombieCount += 1
    const variant = input.variant[slot]!
    if (
      input.active[slot] === 0 ||
      variant >= state.variantCount ||
      !input.readyVariants.has(variant)
    ) {
      continue
    }
    const reacting = input.hitFlash[slot]! > 0 || input.hitReaction[slot]! > 0
    state.reacting[slot] = reacting ? 1 : 0
    const dx = input.x[slot]! - input.observerX
    const dz = input.z[slot]! - input.observerZ
    state.distance[slot] = Math.hypot(dx, dz)
    eligibleActiveCount += 1

    if (
      reacting &&
      state.selected[slot] !== 0 &&
      state.selectedGeneration[slot] === input.generation[slot]
    ) {
      state.residencyUntilSeconds[slot] = Math.max(
        state.residencyUntilSeconds[slot]!,
        elapsedSeconds + ZOMBIE_ESCAPE_DETAILED_HIT_RESIDENCY_SECONDS,
      )
    }
    insertZombieEscapeVisualLodVariantCandidate(state, input, slot, elapsedSeconds)
  }

  let detailedActiveCount = 0
  while (detailedActiveCount < ZOMBIE_ESCAPE_DETAILED_ZOMBIE_CAPACITY) {
    let bestSlot = -1
    for (
      let candidateIndex = 0;
      candidateIndex < state.variantCandidates.length;
      candidateIndex += 1
    ) {
      const slot = state.variantCandidates[candidateIndex]!
      if (slot < 0 || state.nextSelected[slot] !== 0) continue
      const variant = input.variant[slot]!
      if (state.variantCounts[variant]! >= ZOMBIE_ESCAPE_DETAILED_ROOT_CAPACITY_PER_VARIANT) {
        continue
      }
      if (
        bestSlot < 0 ||
        isZombieEscapeVisualLodCandidateBetter(state, input, slot, bestSlot, elapsedSeconds)
      ) {
        bestSlot = slot
      }
    }
    if (bestSlot < 0) break
    state.nextSelected[bestSlot] = 1
    const bestVariant = input.variant[bestSlot]!
    state.variantCounts[bestVariant] = state.variantCounts[bestVariant]! + 1
    detailedActiveCount += 1
  }

  let maximumVariantDetailedCount = 0
  for (let variant = 0; variant < state.variantCounts.length; variant += 1) {
    maximumVariantDetailedCount = Math.max(
      maximumVariantDetailedCount,
      state.variantCounts[variant]!,
    )
  }

  let reactingDetailedCount = 0
  let selectionChangeCount = 0
  for (let slot = 0; slot < state.capacity; slot += 1) {
    const nextSelected = state.nextSelected[slot]!
    const generation = input.generation[slot]!
    const retainedGeneration =
      nextSelected !== 0 &&
      state.selected[slot] !== 0 &&
      state.selectedGeneration[slot] === generation
    const generationChanged = nextSelected !== 0 && !retainedGeneration
    if (state.selected[slot] !== nextSelected || generationChanged) selectionChangeCount += 1
    state.selected[slot] = nextSelected
    if (nextSelected === 0) continue
    if (state.reacting[slot] !== 0) reactingDetailedCount += 1
    if (generationChanged) {
      state.residencyUntilSeconds[slot] = elapsedSeconds
    }
    if (!retainedGeneration) {
      state.residencyUntilSeconds[slot] =
        elapsedSeconds + ZOMBIE_ESCAPE_DETAILED_MINIMUM_RESIDENCY_SECONDS
    }
    if (state.reacting[slot] !== 0) {
      state.residencyUntilSeconds[slot] = Math.max(
        state.residencyUntilSeconds[slot]!,
        elapsedSeconds + ZOMBIE_ESCAPE_DETAILED_HIT_RESIDENCY_SECONDS,
      )
    }
    state.selectedGeneration[slot] = generation
  }

  state.counts.activeZombieCount = activeZombieCount
  state.counts.detailedActiveCount = detailedActiveCount
  state.counts.eligibleActiveCount = eligibleActiveCount
  state.counts.instancedActiveCount = activeZombieCount - detailedActiveCount
  state.counts.maximumVariantDetailedCount = maximumVariantDetailedCount
  state.counts.reactingDetailedCount = reactingDetailedCount
  state.counts.selectionChangeCount = selectionChangeCount
  return state.counts
}

export function createZombieEscapePresentationLodDebugSnapshot(
  variantCount: number,
): ZombieEscapePresentationLodDebugSnapshot {
  if (
    !(Number.isSafeInteger(variantCount) && variantCount >= 1) ||
    variantCount * ZOMBIE_ESCAPE_DETAILED_ROOT_CAPACITY_PER_VARIANT >
      ZOMBIE_ESCAPE_DETAILED_ROOT_CAPACITY
  ) {
    throw new Error(
      `Zombie presentation variant count ${variantCount} exceeds the ${ZOMBIE_ESCAPE_DETAILED_ROOT_CAPACITY}-root budget.`,
    )
  }
  return {
    activeMixerCount: 0,
    activeMixersByVariant: new Uint8Array(variantCount),
    activeZombieCount: 0,
    allocatedRootCount: 0,
    allocatedRootsByVariant: new Uint8Array(variantCount),
    authoredInstancedActiveByVariant: new Uint16Array(variantCount),
    authoredInstancedActiveCount: 0,
    authoredInstancedBatchCount: 0,
    authoredInstancedBatchesByVariant: new Uint8Array(variantCount),
    detailedActiveCount: 0,
    detailedCapacity: ZOMBIE_ESCAPE_DETAILED_ZOMBIE_CAPACITY,
    fallbackCount: 0,
    instancedActiveCount: 0,
    rootCapacity: ZOMBIE_ESCAPE_DETAILED_ROOT_CAPACITY,
    unpresentedActiveCount: 0,
  }
}

export function updateZombieEscapePresentationLodDebugSelection(
  snapshot: ZombieEscapePresentationLodDebugSnapshot,
  counts: ZombieEscapeVisualLodCounts,
) {
  if (
    counts.detailedActiveCount > ZOMBIE_ESCAPE_DETAILED_ZOMBIE_CAPACITY ||
    counts.detailedActiveCount > counts.activeZombieCount ||
    counts.instancedActiveCount !== counts.activeZombieCount - counts.detailedActiveCount
  ) {
    throw new Error('Zombie presentation LOD selection violated its accounting bounds.')
  }
  snapshot.activeZombieCount = counts.activeZombieCount
  snapshot.detailedActiveCount = counts.detailedActiveCount
  snapshot.instancedActiveCount = counts.instancedActiveCount
  updateZombieEscapeUnpresentedActiveCount(snapshot)
}

export function updateZombieEscapePresentationLodDebugAuthoredVariant(
  snapshot: ZombieEscapePresentationLodDebugSnapshot,
  variantIndex: number,
  activeInstanceCount: number,
  batchCount: number,
) {
  if (
    !(Number.isSafeInteger(variantIndex) && variantIndex >= 0) ||
    variantIndex >= snapshot.authoredInstancedActiveByVariant.length ||
    !(Number.isSafeInteger(activeInstanceCount) && activeInstanceCount >= 0) ||
    !(Number.isSafeInteger(batchCount) && batchCount >= 0 && batchCount <= 255) ||
    (activeInstanceCount === 0) !== (batchCount === 0)
  ) {
    throw new Error('Authored zombie presentation metrics violated their accounting bounds.')
  }
  snapshot.authoredInstancedActiveCount +=
    activeInstanceCount - snapshot.authoredInstancedActiveByVariant[variantIndex]!
  snapshot.authoredInstancedBatchCount +=
    batchCount - snapshot.authoredInstancedBatchesByVariant[variantIndex]!
  snapshot.authoredInstancedActiveByVariant[variantIndex] = activeInstanceCount
  snapshot.authoredInstancedBatchesByVariant[variantIndex] = batchCount
  snapshot.fallbackCount = 0
  updateZombieEscapeUnpresentedActiveCount(snapshot)
}

export function updateZombieEscapePresentationLodDebugVariant(
  snapshot: ZombieEscapePresentationLodDebugSnapshot,
  variantIndex: number,
  allocatedRootCount: number,
  activeMixerCount: number,
) {
  if (
    !(Number.isSafeInteger(variantIndex) && variantIndex >= 0) ||
    variantIndex >= snapshot.allocatedRootsByVariant.length ||
    !(Number.isSafeInteger(allocatedRootCount) && allocatedRootCount >= 0) ||
    allocatedRootCount > ZOMBIE_ESCAPE_DETAILED_ROOT_CAPACITY_PER_VARIANT ||
    !(Number.isSafeInteger(activeMixerCount) && activeMixerCount >= 0) ||
    activeMixerCount > allocatedRootCount
  ) {
    throw new Error('Zombie presentation LOD variant metrics violated their allocation bounds.')
  }
  snapshot.allocatedRootCount +=
    allocatedRootCount - snapshot.allocatedRootsByVariant[variantIndex]!
  snapshot.activeMixerCount += activeMixerCount - snapshot.activeMixersByVariant[variantIndex]!
  snapshot.allocatedRootsByVariant[variantIndex] = allocatedRootCount
  snapshot.activeMixersByVariant[variantIndex] = activeMixerCount
  if (snapshot.allocatedRootCount > snapshot.rootCapacity) {
    throw new Error('Zombie presentation LOD exceeded its global root budget.')
  }
}

export function resolveZombieEscapeDetailedRootPoolSize(
  variantByPoolSlot: Uint8Array,
  variantIndex: number,
) {
  if (!(Number.isSafeInteger(variantIndex) && variantIndex >= 0 && variantIndex <= 255)) {
    throw new Error(
      `Zombie variant index must be an integer from 0 to 255; received ${variantIndex}.`,
    )
  }
  let rosterCount = 0
  for (const variant of variantByPoolSlot) {
    if (variant === variantIndex) rosterCount += 1
  }
  return Math.min(ZOMBIE_ESCAPE_DETAILED_ROOT_CAPACITY_PER_VARIANT, rosterCount)
}

function insertZombieEscapeVisualLodVariantCandidate(
  state: ZombieEscapeVisualLodState,
  input: ZombieEscapeVisualLodInput,
  slot: number,
  elapsedSeconds: number,
) {
  const start = input.variant[slot]! * ZOMBIE_ESCAPE_DETAILED_ROOT_CAPACITY_PER_VARIANT
  const end = start + ZOMBIE_ESCAPE_DETAILED_ROOT_CAPACITY_PER_VARIANT
  for (let candidateIndex = start; candidateIndex < end; candidateIndex += 1) {
    const incumbentSlot = state.variantCandidates[candidateIndex]!
    if (
      incumbentSlot >= 0 &&
      !isZombieEscapeVisualLodCandidateBetter(state, input, slot, incumbentSlot, elapsedSeconds)
    ) {
      continue
    }
    for (let shiftIndex = end - 1; shiftIndex > candidateIndex; shiftIndex -= 1) {
      state.variantCandidates[shiftIndex] = state.variantCandidates[shiftIndex - 1]!
    }
    state.variantCandidates[candidateIndex] = slot
    return
  }
}

function updateZombieEscapeUnpresentedActiveCount(
  snapshot: ZombieEscapePresentationLodDebugSnapshot,
) {
  snapshot.unpresentedActiveCount = Math.max(
    0,
    snapshot.activeZombieCount -
      snapshot.detailedActiveCount -
      snapshot.authoredInstancedActiveCount -
      snapshot.fallbackCount,
  )
}

function isZombieEscapeVisualLodCandidateBetter(
  state: ZombieEscapeVisualLodState,
  input: ZombieEscapeVisualLodInput,
  candidateSlot: number,
  incumbentSlot: number,
  elapsedSeconds: number,
) {
  const candidateReacting = state.reacting[candidateSlot]!
  const incumbentReacting = state.reacting[incumbentSlot]!
  if (candidateReacting !== incumbentReacting) return candidateReacting > incumbentReacting

  const candidateRetained = isZombieEscapeVisualLodSlotRetained(state, input, candidateSlot)
  const incumbentRetained = isZombieEscapeVisualLodSlotRetained(state, input, incumbentSlot)
  const candidateResident =
    candidateRetained && state.residencyUntilSeconds[candidateSlot]! > elapsedSeconds
  const incumbentResident =
    incumbentRetained && state.residencyUntilSeconds[incumbentSlot]! > elapsedSeconds
  if (candidateResident !== incumbentResident) return candidateResident

  const candidateDistance =
    state.distance[candidateSlot]! -
    (candidateRetained ? ZOMBIE_ESCAPE_DETAILED_DISTANCE_HYSTERESIS_METERS : 0)
  const incumbentDistance =
    state.distance[incumbentSlot]! -
    (incumbentRetained ? ZOMBIE_ESCAPE_DETAILED_DISTANCE_HYSTERESIS_METERS : 0)
  if (candidateDistance !== incumbentDistance) return candidateDistance < incumbentDistance
  return candidateSlot < incumbentSlot
}

function isZombieEscapeVisualLodSlotRetained(
  state: ZombieEscapeVisualLodState,
  input: ZombieEscapeVisualLodInput,
  slot: number,
) {
  return state.selected[slot] !== 0 && state.selectedGeneration[slot] === input.generation[slot]
}

function assertZombieEscapeVisualLodInputCapacity(
  capacity: number,
  input: ZombieEscapeVisualLodInput,
) {
  assertZombieEscapeVisualLodArrayCapacity('active', input.active, capacity)
  assertZombieEscapeVisualLodArrayCapacity('generation', input.generation, capacity)
  assertZombieEscapeVisualLodArrayCapacity('hitFlash', input.hitFlash, capacity)
  assertZombieEscapeVisualLodArrayCapacity('hitReaction', input.hitReaction, capacity)
  assertZombieEscapeVisualLodArrayCapacity('variant', input.variant, capacity)
  assertZombieEscapeVisualLodArrayCapacity('x', input.x, capacity)
  assertZombieEscapeVisualLodArrayCapacity('z', input.z, capacity)
}

function assertZombieEscapeVisualLodArrayCapacity(
  name: string,
  values: ArrayLike<number>,
  capacity: number,
) {
  if (values.length < capacity) {
    throw new Error(
      `Zombie visual LOD ${name} length ${values.length} is below capacity ${capacity}.`,
    )
  }
}
