import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapePresentationLodDebugSnapshot,
  createZombieEscapeVisualLodState,
  resolveZombieEscapeDetailedRootPoolSize,
  updateZombieEscapePresentationLodDebugAuthoredVariant,
  updateZombieEscapePresentationLodDebugSelection,
  updateZombieEscapePresentationLodDebugVariant,
  updateZombieEscapeVisualLod,
  ZOMBIE_ESCAPE_DETAILED_ROOT_CAPACITY_PER_VARIANT,
  ZOMBIE_ESCAPE_DETAILED_ZOMBIE_CAPACITY,
  type ZombieEscapeVisualLodInput,
} from './zombie-escape-visual-lod'
import { ZOMBIE_ESCAPE_ZOMBIE_CATALOG } from './zombie-escape-zombie-catalog'

function createVisualLodFixture(capacity: number) {
  const input: ZombieEscapeVisualLodInput = {
    active: new Uint8Array(capacity).fill(1),
    elapsedSeconds: 0,
    generation: new Uint32Array(capacity).fill(1),
    hitFlash: new Float32Array(capacity),
    hitReaction: new Float32Array(capacity),
    observerX: 0,
    observerZ: 0,
    readyVariants: new Set(ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map((_, index) => index)),
    variant: new Uint8Array(capacity),
    x: new Float32Array(capacity),
    z: new Float32Array(capacity),
  }
  for (let slot = 0; slot < capacity; slot += 1) {
    input.variant[slot] = slot % ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length
    input.x[slot] = slot
  }
  return {
    input,
    state: createZombieEscapeVisualLodState(capacity, ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length),
  }
}

function readSelectedSlots(selected: Uint8Array) {
  const slots: number[] = []
  for (let slot = 0; slot < selected.length; slot += 1) {
    if (selected[slot] !== 0) slots.push(slot)
  }
  return slots
}

describe('zombie visual LOD selection', () => {
  test('fills the exact global cap with nearest ready slots while capping every variant at two', () => {
    const { input, state } = createVisualLodFixture(30)
    const counts = updateZombieEscapeVisualLod(state, input)

    expect(readSelectedSlots(state.selected)).toEqual(
      Array.from({ length: ZOMBIE_ESCAPE_DETAILED_ZOMBIE_CAPACITY }, (_, index) => index),
    )
    expect(counts).toEqual({
      activeZombieCount: 30,
      detailedActiveCount: ZOMBIE_ESCAPE_DETAILED_ZOMBIE_CAPACITY,
      eligibleActiveCount: 30,
      instancedActiveCount: 30 - ZOMBIE_ESCAPE_DETAILED_ZOMBIE_CAPACITY,
      maximumVariantDetailedCount: ZOMBIE_ESCAPE_DETAILED_ROOT_CAPACITY_PER_VARIANT,
      reactingDetailedCount: 0,
      selectionChangeCount: ZOMBIE_ESCAPE_DETAILED_ZOMBIE_CAPACITY,
    })
  })

  test('has no stationary churn and requires a challenger to clear residency and hysteresis', () => {
    const { input, state } = createVisualLodFixture(17)
    input.x[16] = 100
    updateZombieEscapeVisualLod(state, input)
    const initial = readSelectedSlots(state.selected)

    input.elapsedSeconds = 0.2
    input.x[16] = 0.1
    expect(updateZombieEscapeVisualLod(state, input).selectionChangeCount).toBe(0)
    expect(readSelectedSlots(state.selected)).toEqual(initial)

    input.elapsedSeconds = 1
    input.x[16] = 14.5
    expect(updateZombieEscapeVisualLod(state, input).selectionChangeCount).toBe(0)
    expect(readSelectedSlots(state.selected)).toEqual(initial)

    input.elapsedSeconds = 1.1
    input.x[16] = 10
    expect(updateZombieEscapeVisualLod(state, input).selectionChangeCount).toBe(2)
    expect(state.selected[15]).toBe(0)
    expect(state.selected[16]).toBe(1)

    input.elapsedSeconds = 2
    expect(updateZombieEscapeVisualLod(state, input).selectionChangeCount).toBe(0)
  })

  test('prioritizes a new hit and retains its attachment slot beyond the reaction', () => {
    const { input, state } = createVisualLodFixture(17)
    input.x[16] = 100
    updateZombieEscapeVisualLod(state, input)

    input.elapsedSeconds = 0.1
    input.hitReaction[16] = 1
    updateZombieEscapeVisualLod(state, input)
    expect(state.selected[16]).toBe(1)
    expect(state.counts.reactingDetailedCount).toBe(1)

    input.elapsedSeconds = 0.4
    input.hitReaction[16] = 0
    updateZombieEscapeVisualLod(state, input)
    expect(state.selected[16]).toBe(1)

    input.elapsedSeconds = 0.9
    updateZombieEscapeVisualLod(state, input)
    expect(state.selected[16]).toBe(0)
  })

  test('does not carry residency across a reused pool-slot generation', () => {
    const { input, state } = createVisualLodFixture(17)
    input.x[16] = 100
    updateZombieEscapeVisualLod(state, input)

    input.elapsedSeconds = 0.1
    input.generation[0] = 2
    input.x[0] = 100
    input.x[16] = 0.1
    updateZombieEscapeVisualLod(state, input)
    expect(state.selected[0]).toBe(0)
    expect(state.selected[16]).toBe(1)
  })

  test('keeps unavailable variants in the instanced remainder', () => {
    const { input, state } = createVisualLodFixture(20)
    input.readyVariants = new Set([0])
    updateZombieEscapeVisualLod(state, input)
    expect(readSelectedSlots(state.selected)).toEqual([0, 10])
    expect(state.counts.eligibleActiveCount).toBe(2)
  })
})

describe('zombie detailed root allocation', () => {
  test('allocates no more than two roots per variant and twenty for the ten-variant catalog', () => {
    const roster = new Uint8Array(100)
    for (let slot = 0; slot < roster.length; slot += 1) {
      roster[slot] = slot % ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length
    }
    const rootCounts = ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map((_, variantIndex) =>
      resolveZombieEscapeDetailedRootPoolSize(roster, variantIndex),
    )
    expect(rootCounts.every((count) => count <= 2)).toBe(true)
    expect(rootCounts.reduce((sum, count) => sum + count, 0)).toBe(20)
  })

  test('does not allocate unused roots for a sparse roster', () => {
    const roster = new Uint8Array([0, 0, 1])
    expect(resolveZombieEscapeDetailedRootPoolSize(roster, 0)).toBe(2)
    expect(resolveZombieEscapeDetailedRootPoolSize(roster, 1)).toBe(1)
    expect(resolveZombieEscapeDetailedRootPoolSize(roster, 2)).toBe(0)
  })

  test('reports allocation-free bounded presentation accounting', () => {
    const { input, state } = createVisualLodFixture(100)
    const counts = updateZombieEscapeVisualLod(state, input)
    const snapshot = createZombieEscapePresentationLodDebugSnapshot(
      ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length,
    )
    updateZombieEscapePresentationLodDebugSelection(snapshot, counts)
    for (
      let variantIndex = 0;
      variantIndex < ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length;
      variantIndex += 1
    ) {
      updateZombieEscapePresentationLodDebugVariant(snapshot, variantIndex, 2, 1)
      updateZombieEscapePresentationLodDebugAuthoredVariant(
        snapshot,
        variantIndex,
        variantIndex < 6 ? 8 : 9,
        1,
      )
    }

    expect(snapshot.activeZombieCount).toBe(100)
    expect(snapshot.detailedActiveCount).toBe(16)
    expect(snapshot.instancedActiveCount).toBe(84)
    expect(snapshot.detailedActiveCount + snapshot.instancedActiveCount).toBe(
      snapshot.activeZombieCount,
    )
    expect(snapshot.allocatedRootCount).toBe(20)
    expect(snapshot.activeMixerCount).toBe(10)
    expect(snapshot.authoredInstancedActiveCount).toBe(84)
    expect(snapshot.authoredInstancedBatchCount).toBe(10)
    expect(snapshot.fallbackCount).toBe(0)
    expect(snapshot.unpresentedActiveCount).toBe(0)
    expect(snapshot.detailedActiveCount).toBeLessThanOrEqual(snapshot.detailedCapacity)
    expect(snapshot.allocatedRootCount).toBeLessThanOrEqual(snapshot.rootCapacity)
  })
})
