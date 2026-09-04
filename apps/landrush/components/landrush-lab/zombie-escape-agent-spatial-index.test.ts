import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeAgentSeparation,
  createZombieEscapeAgentSpatialIndex,
  rebuildZombieEscapeAgentSpatialIndex,
  resetZombieEscapeAgentSpatialIndex,
  resolveZombieEscapeAgentSeparation,
} from '@landrush/zombie-gameplay/zombie-escape-agent-spatial-index'
import { createZombieEscapeCollisionWorld } from '@landrush/zombie-gameplay/zombie-escape-collision-world'
import {
  ZOMBIE_ESCAPE_CAPACITY,
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from '@landrush/zombie-gameplay/zombie-escape-config'
import { createZombieEscapeControlState } from '@landrush/zombie-gameplay/zombie-escape-controls'
import {
  createZombieEscapeSimulation,
  setZombieEscapeGamePhase,
  spawnZombieEscapeZombie,
  stepZombieEscapeSimulation,
} from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { createZombieEscapeArena } from '@landrush/zombie-gameplay/zombie-escape-world'

describe('Zombie Escape agent spatial index', () => {
  test('rebuilds and resolves candidates deterministically in stable entity order', () => {
    const world = createLayeredWorld()
    const agents = createAgents(8)
    for (let slot = 0; slot < agents.active.length; slot += 1) {
      agents.active[slot] = 1
      agents.health[slot] = 100
      agents.x[slot] = -1.2 + slot * 0.35
      agents.z[slot] = (slot % 2) * 0.2
    }
    const first = createTestIndex(agents.active.length)
    const second = createTestIndex(agents.active.length)
    const firstResults = resolveAll(first, world, agents)
    const secondResults = resolveAll(second, world, agents)

    expect(secondResults).toEqual(firstResults)
    expect(second.agentLayerKeys).toEqual(first.agentLayerKeys)
    expect(second.candidateInspectionCount).toBe(first.candidateInspectionCount)
    expect(second.pairInspectionCount).toBe(first.pairInspectionCount)
    expect(second.separationNeighborCount).toBe(first.separationNeighborCount)
  })

  test('discovers same-layer neighbors and preserves the prior separation equation', () => {
    const world = createLayeredWorld()
    const agents = createAgents(2)
    agents.active.fill(1)
    agents.health.fill(100)
    agents.x[0] = 0
    agents.x[1] = 1
    const index = createTestIndex(2)
    rebuild(index, world, agents)
    const output = createZombieEscapeAgentSeparation()

    resolveZombieEscapeAgentSeparation(
      index,
      0,
      agents.active,
      agents.health,
      agents.x,
      agents.y,
      agents.z,
      output,
    )

    expect(output.x).toBeCloseTo(-((1.75 - 1) / 1.75) * 1.55, 8)
    expect(output.z).toBe(0)
    expect(index.candidateInspectionCount).toBe(2)
    expect(index.pairInspectionCount).toBe(1)
    expect(index.separationNeighborCount).toBe(1)
  })

  test('excludes overlapping agents on different floors and on connector versus floor', () => {
    const world = createLayeredWorld(true)
    const agents = createAgents(4)
    agents.active.fill(1)
    agents.health.fill(100)
    agents.x.set([0, 1, 5, 6])
    agents.y.set([0, 3, 0.1, 0])
    agents.navigationConnector[2] = 0
    const index = createTestIndex(4)
    rebuild(index, world, agents)
    const output = createZombieEscapeAgentSeparation()

    resolveZombieEscapeAgentSeparation(
      index,
      0,
      agents.active,
      agents.health,
      agents.x,
      agents.y,
      agents.z,
      output,
    )
    expect(output).toEqual({ x: 0, z: 0 })
    expect(index.agentLayerKeys[0]).not.toBe(index.agentLayerKeys[1])
    expect(index.agentLayerKeys[2]).not.toBe(index.agentLayerKeys[3])

    resolveZombieEscapeAgentSeparation(
      index,
      2,
      agents.active,
      agents.health,
      agents.x,
      agents.y,
      agents.z,
      output,
    )
    expect(output).toEqual({ x: 0, z: 0 })
  })

  test('preserves exact ascending candidate order when the neighborhood fits the budget', () => {
    const capacity = 17
    const world = createLayeredWorld()
    const agents = createAgents(capacity)
    agents.active.fill(1)
    agents.health.fill(100)
    for (let slot = 1; slot < capacity; slot += 1) {
      const cell = slot - 1
      agents.x[slot] = ((cell % 3) - 1) * 1.75 + 0.2
      agents.z[slot] = ((Math.floor(cell / 3) % 3) - 1) * 1.75 + 0.2
    }
    const index = createTestIndex(capacity)
    rebuild(index, world, agents)

    resolveZombieEscapeAgentSeparation(
      index,
      0,
      agents.active,
      agents.health,
      agents.x,
      agents.y,
      agents.z,
      createZombieEscapeAgentSeparation(),
    )

    expect(index.queryCandidateCount).toBe(capacity)
    expect(candidateSlots(index)).toEqual(Array.from({ length: capacity }, (_, slot) => slot))
    expect(index.overflowQueryCount).toBe(0)
  })

  test('indexes every dense-cell agent and bounds each query to 48 rotating samples', () => {
    const capacity = 64
    const world = createLayeredWorld()
    const agents = createAgents(capacity)
    agents.active.fill(1)
    agents.health.fill(100)
    for (let slot = 0; slot < capacity; slot += 1) agents.x[slot] = slot * 0.01
    const index = createTestIndex(capacity)
    const output = createZombieEscapeAgentSeparation()
    rebuild(index, world, agents)

    expect(index.indexedAgentCount).toBe(capacity)
    expect(index.unindexedAgentCount).toBe(0)
    expect(Array.from(index.cellOccupants)).toEqual(
      Array.from({ length: capacity }, (_, slot) => slot),
    )
    resolveZombieEscapeAgentSeparation(
      index,
      0,
      agents.active,
      agents.health,
      agents.x,
      agents.y,
      agents.z,
      output,
    )
    const firstEpochCandidates = candidateSlots(index)
    expect(index.queryCandidateCount).toBe(48)
    expect(index.candidateInspectionCount).toBe(48)
    expect(index.maximumCandidateInspectionsObserved).toBe(48)
    expect(index.maximumNeighborhoodCandidateCountObserved).toBe(capacity)
    expect(index.overflowQueryCount).toBe(1)

    rebuild(index, world, agents)
    resolveZombieEscapeAgentSeparation(
      index,
      0,
      agents.active,
      agents.health,
      agents.x,
      agents.y,
      agents.z,
      output,
    )
    const sampledAcrossEpochs = [
      ...new Set([...firstEpochCandidates, ...candidateSlots(index)]),
    ].sort((left, right) => left - right)
    expect(sampledAcrossEpochs).toEqual(Array.from({ length: capacity }, (_, slot) => slot))
    expect(sampledAcrossEpochs).toContain(63)
  })

  test('samples overfull neighborhoods deterministically with a source-dependent phase', () => {
    const capacity = 64
    const world = createLayeredWorld()
    const agents = createAgents(capacity)
    agents.active.fill(1)
    agents.health.fill(100)
    for (let slot = 0; slot < capacity; slot += 1) agents.x[slot] = slot * 0.01
    const first = createTestIndex(capacity)
    const second = createTestIndex(capacity)
    const output = createZombieEscapeAgentSeparation()
    rebuild(first, world, agents)
    rebuild(second, world, agents)

    resolveZombieEscapeAgentSeparation(
      first,
      0,
      agents.active,
      agents.health,
      agents.x,
      agents.y,
      agents.z,
      output,
    )
    const firstSourceCandidates = candidateSlots(first)
    resolveZombieEscapeAgentSeparation(
      second,
      0,
      agents.active,
      agents.health,
      agents.x,
      agents.y,
      agents.z,
      output,
    )
    expect(candidateSlots(second)).toEqual(firstSourceCandidates)

    resolveZombieEscapeAgentSeparation(
      first,
      1,
      agents.active,
      agents.health,
      agents.x,
      agents.y,
      agents.z,
      output,
    )
    expect(candidateSlots(first)).not.toEqual(firstSourceCandidates)
  })

  test('rotates samples across every cell in a complete overfull neighborhood', () => {
    const capacity = 72
    const world = createLayeredWorld()
    const agents = createAgents(capacity)
    agents.active.fill(1)
    agents.health.fill(100)
    for (let slot = 1; slot < capacity; slot += 1) {
      const cell = (slot - 1) % 9
      agents.x[slot] = ((cell % 3) - 1) * 1.75 + 0.2
      agents.z[slot] = (Math.floor(cell / 3) - 1) * 1.75 + 0.2
    }
    const index = createTestIndex(capacity)
    const output = createZombieEscapeAgentSeparation()
    const sampledSlots = new Set<number>()

    for (let epoch = 0; epoch < 2; epoch += 1) {
      rebuild(index, world, agents)
      resolveZombieEscapeAgentSeparation(
        index,
        0,
        agents.active,
        agents.health,
        agents.x,
        agents.y,
        agents.z,
        output,
      )
      for (const slot of candidateSlots(index)) sampledSlots.add(slot)
    }

    expect([...sampledSlots].sort((left, right) => left - right)).toEqual(
      Array.from({ length: capacity }, (_, slot) => slot),
    )
    expect(index.maximumNeighborhoodCandidateCountObserved).toBe(capacity)
    expect(index.maximumCandidateInspectionsObserved).toBe(48)
  })

  test('keeps lifetime work counters monotonic until an explicit reset', () => {
    const world = createLayeredWorld()
    const agents = createAgents(64)
    agents.active.fill(1)
    agents.health.fill(100)
    const index = createTestIndex(64)
    const output = createZombieEscapeAgentSeparation()

    rebuild(index, world, agents)
    resolveZombieEscapeAgentSeparation(
      index,
      0,
      agents.active,
      agents.health,
      agents.x,
      agents.y,
      agents.z,
      output,
    )
    rebuild(index, world, agents)
    resolveZombieEscapeAgentSeparation(
      index,
      1,
      agents.active,
      agents.health,
      agents.x,
      agents.y,
      agents.z,
      output,
    )

    expect(index.buildCount).toBe(2)
    expect(index.queryCount).toBe(2)
    expect(index.candidateInspectionCount).toBe(96)
    expect(index.overflowQueryCount).toBe(2)
    expect(index.maximumCandidateInspectionsObserved).toBe(48)
    expect(index.indexedAgentCount).toBe(64)
    expect(index.unindexedAgentCount).toBe(0)

    resetZombieEscapeAgentSpatialIndex(index)
    expect(index.buildCount).toBe(0)
    expect(index.queryCount).toBe(0)
    expect(index.candidateInspectionCount).toBe(0)
    expect(index.overflowQueryCount).toBe(0)
    expect(index.maximumCandidateInspectionsObserved).toBe(0)
  })

  test('keeps the 6,400-agent dense-neighborhood contract bounded and deterministic', () => {
    const capacity = 6_400
    const world = createLayeredWorld()
    const agents = createAgents(capacity)
    agents.active.fill(1)
    agents.health.fill(100)
    const first = createTestIndex(capacity)
    const second = createTestIndex(capacity)

    const firstFingerprint = resolveDenseCandidateFingerprint(first, world, agents)
    const secondFingerprint = resolveDenseCandidateFingerprint(second, world, agents)

    expect(secondFingerprint).toBe(firstFingerprint)
    expect(first.indexedAgentCount).toBe(capacity)
    expect(first.unindexedAgentCount).toBe(0)
    expect(first.queryCount).toBe(capacity)
    expect(first.candidateInspectionCount).toBe(capacity * 48)
    expect(first.candidateInspectionCount).toBeLessThanOrEqual(first.queryCount * 48)
    expect(first.maximumCandidateInspectionsObserved).toBe(48)
    expect(first.overflowQueryCount).toBe(capacity)
    expect(second.candidateInspectionCount).toBe(first.candidateInspectionCount)
  })

  test('uses the bounded index in the fixed-step simulation instead of an all-pairs scan', () => {
    const arena = createZombieEscapeArena(72_001)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 72_002)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 10
    state.player.z = 10
    for (let slot = 0; slot < ZOMBIE_ESCAPE_CAPACITY.zombies; slot += 1) {
      spawnZombieEscapeZombie(state, slot * 0.01, 0)
    }

    stepZombieEscapeSimulation(state, createZombieEscapeControlState(), 1 / 60, arena)

    expect(state.agentSpatialIndex.indexedAgentCount).toBe(ZOMBIE_ESCAPE_CAPACITY.zombies)
    expect(state.agentSpatialIndex.maximumCandidateInspectionsObserved).toBeLessThanOrEqual(
      ZOMBIE_ESCAPE_SIMULATION.zombieSpatialMaximumCandidateInspectionsPerQuery,
    )
    expect(state.agentSpatialIndex.candidateInspectionCount).toBeLessThanOrEqual(
      ZOMBIE_ESCAPE_CAPACITY.zombies *
        ZOMBIE_ESCAPE_SIMULATION.zombieSpatialMaximumCandidateInspectionsPerQuery,
    )
    expect(
      [...state.zombies.x].every(Number.isFinite) && [...state.zombies.z].every(Number.isFinite),
    ).toBe(true)
  })
})

function createTestIndex(capacity: number) {
  return createZombieEscapeAgentSpatialIndex(capacity, {
    cellSizeMeters: 1.75,
    maximumCandidateInspectionsPerQuery: 48,
    separationRadiusMeters: 1.75,
    separationStrength: 1.55,
    verticalToleranceMeters: 0.75,
  })
}

function candidateSlots(index: ReturnType<typeof createTestIndex>) {
  return Array.from(index.queryCandidateSlots.subarray(0, index.queryCandidateCount))
}

function createAgents(capacity: number) {
  return {
    active: new Uint8Array(capacity),
    health: new Float32Array(capacity),
    navigationConnector: new Int16Array(capacity).fill(-1),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    z: new Float32Array(capacity),
  }
}

function rebuild(
  index: ReturnType<typeof createTestIndex>,
  world: ReturnType<typeof createLayeredWorld>,
  agents: ReturnType<typeof createAgents>,
) {
  return rebuildZombieEscapeAgentSpatialIndex(
    index,
    world,
    agents.active,
    agents.health,
    agents.x,
    agents.y,
    agents.z,
    agents.navigationConnector,
  )
}

function resolveAll(
  index: ReturnType<typeof createTestIndex>,
  world: ReturnType<typeof createLayeredWorld>,
  agents: ReturnType<typeof createAgents>,
) {
  rebuild(index, world, agents)
  const output = createZombieEscapeAgentSeparation()
  return Array.from({ length: agents.active.length }, (_, slot) => {
    resolveZombieEscapeAgentSeparation(
      index,
      slot,
      agents.active,
      agents.health,
      agents.x,
      agents.y,
      agents.z,
      output,
    )
    return { x: output.x, z: output.z }
  })
}

function resolveDenseCandidateFingerprint(
  index: ReturnType<typeof createTestIndex>,
  world: ReturnType<typeof createLayeredWorld>,
  agents: ReturnType<typeof createAgents>,
) {
  rebuild(index, world, agents)
  const output = createZombieEscapeAgentSeparation()
  let fingerprint = 0x811c_9dc5
  for (let slot = 0; slot < agents.active.length; slot += 1) {
    resolveZombieEscapeAgentSeparation(
      index,
      slot,
      agents.active,
      agents.health,
      agents.x,
      agents.y,
      agents.z,
      output,
    )
    expect(Number.isFinite(output.x) && Number.isFinite(output.z)).toBe(true)
    for (let candidate = 0; candidate < index.queryCandidateCount; candidate += 1) {
      fingerprint = Math.imul(fingerprint ^ index.queryCandidateSlots[candidate]!, 0x0100_0193)
    }
  }
  return fingerprint >>> 0
}

function createLayeredWorld(withConnector = false) {
  return createZombieEscapeCollisionWorld({
    agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
    boundaryPolicy: 'none',
    navigationConnectors: withConnector
      ? [
          {
            ascendingEnd: true,
            chainId: 'stairs',
            chainLowerY: 0,
            chainOrder: 0,
            chainUpperY: 3,
            endX: 1,
            endY: 3,
            endZ: 0,
            halfWidth: 0.8,
            id: 'stairs:0',
            startX: -1,
            startY: 0,
            startZ: 0,
          },
        ]
      : [],
    navigationSupports: [0, 3].map((elevation) => ({
      boundary: true as const,
      elevation,
      id: `floor:${String(elevation)}`,
      polygon: [
        { x: -8, z: -8 },
        { x: 8, z: -8 },
        { x: 8, z: 8 },
        { x: -8, z: 8 },
      ],
    })),
    playRadius: 10,
  })
}
