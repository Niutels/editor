import assert from 'node:assert/strict'
import test from 'node:test'
import scenario, {
  summarizeZombieNavigationScaleProof,
  zombieNavigationScaleProofIssues,
} from './landrush-zombie-navigation-scale-proof.mjs'

function work(overrides = {}) {
  return {
    candidateVisits: 120,
    collisionPredicates: 24,
    graphEdgeVisits: 260,
    heapOperations: 116,
    hierarchyNodeVisits: 100,
    publications: 4,
    serviceSlices: 55,
    supportPredicates: 48,
    targetBuilds: 55,
    ...overrides,
  }
}

function maximumStepWork(overrides = {}) {
  return work({
    candidateVisits: 16,
    collisionPredicates: 8,
    graphEdgeVisits: 32,
    heapOperations: 14,
    hierarchyNodeVisits: 12,
    publications: 1,
    serviceSlices: 1,
    supportPredicates: 10,
    targetBuilds: 1,
    ...overrides,
  })
}

function counterDelta(overrides = {}) {
  return {
    attachmentWork: 0,
    cachedAnchorLost: 0,
    inlineRecoveryWithoutFirstService: 0,
    intentCanceled: 0,
    intentFirstService: 0,
    intentIssued: 0,
    intentResolved: 0,
    intentResolveSlices: 0,
    routePublishedDemand: 0,
    searchRestarted: 0,
    searchStarted: 0,
    searchUncausedStartViolations: 0,
    ...overrides,
  }
}

function fingerprint(overrides = {}) {
  return {
    activeMaskHash: '1000000000000001',
    combinedHash: '2000000000000002',
    requiredDoorClosedBreakable: true,
    semanticKeyHash: '3000000000000003',
    signatureHash: '4000000000000004',
    topologyHash: '5000000000000005',
    ...overrides,
  }
}

function reverseField() {
  return {
    activeBankIndex: 0,
    activeGeneration: 8,
    activeRouteTargetLayerIndex: 1,
    activeWorldRevision: 'production-world:12',
    allocatedBytes: 18_444,
    availableReaderLeases: 10,
    bankOneGeneration: 7,
    bankOneReaderCount: 0,
    bankZeroGeneration: 8,
    bankZeroReaderCount: 0,
    leaseInvariantViolationCount: 0,
    maximumReaderLeaseCount: 1,
    publicationBlockedCount: 0,
    publicationCount: 4,
    readerLeaseCount: 0,
    singletonPinned: false,
    spawnPinned: false,
  }
}

function witness(direction) {
  const ascending = direction === 'lower-to-upper'
  return {
    completed: true,
    direction,
    endLayerIndex: ascending ? 1 : 0,
    endY: ascending ? 3 : 0,
    enteredConnector: true,
    finalConnectorIndex: -1,
    sourceNode: ascending ? 12 : 98,
    sourceRadialReady: true,
    startLayerIndex: ascending ? 0 : 1,
    startY: ascending ? 0 : 3,
    tickCount: 20,
    waypointAdvanced: true,
  }
}

function frozen(size, generationAfter, repairCount, overrides = {}) {
  const settleTickCount = repairCount === 0 ? 1 : Math.ceil(repairCount / 8) + 1
  const inlineRecoveryCount = overrides.repairInlineRecoveryWithoutFirstServiceCount ?? 0
  const firstServiceCount = repairCount - inlineRecoveryCount
  return {
    adoptedAgentCount: size,
    committedGeneration: generationAfter,
    counterDelta: counterDelta({
      inlineRecoveryWithoutFirstService: inlineRecoveryCount,
      intentFirstService: firstServiceCount,
      intentIssued: repairCount,
      intentResolved: repairCount,
      intentResolveSlices: repairCount,
      routePublishedDemand: repairCount,
      searchStarted: firstServiceCount,
    }),
    invalidAgentCount: 0,
    maximumAgentServiceSlicesPerTick: Math.min(8, repairCount),
    maximumFirstServiceAgeTicks: repairCount === 0 ? 0 : Math.ceil(repairCount / 8),
    maximumRepairFirstServiceTicks: firstServiceCount === 0 ? 0 : Math.ceil(firstServiceCount / 8),
    maximumRepairHoldTicks: repairCount === 0 ? 0 : settleTickCount,
    maximumSuccessorVisits: 42,
    publicationAdoptedAgentCount: size - repairCount,
    publicationRepairAgentCount: repairCount,
    reacquiringAgentCount: 0,
    repairFirstServiceObservedCount: firstServiceCount,
    repairHoldObservedCount: repairCount,
    repairInlineRecoveryWithoutFirstServiceCount: inlineRecoveryCount,
    settleTickCount,
    ...overrides,
  }
}

function topologyTransition(size, generationBefore, generationAfter, repairCount, overrides = {}) {
  return {
    frozen: frozen(size, generationAfter, repairCount, overrides),
    generationAfter,
    generationBefore,
  }
}

function publicationTransition(
  size,
  generationBefore,
  generationAfter,
  hashPrefix,
  repairCount,
  overrides = {},
) {
  const classification = frozen(size, generationAfter, repairCount, overrides)
  return {
    frozen: classification,
    generationAfter,
    generationBefore,
    movement: {
      counterDelta: counterDelta(),
      enabledAgentCount: size,
      finalAdoptedAgentCount: size,
      fixtureParkingAgentCount: size,
      fixtureParkingDistanceMaximum: 0.371,
      fixtureParkingDistanceMinimum: 0.371,
      fixtureParkingPoseHash: `${hashPrefix}00000000000000${hashPrefix}`,
      fixtureParkingSetupOnly: true,
      currentGenerationMovementOnly: true,
      lockstepAnalyticFirstTickDisplacement: 0.006,
      lockstepAnchorOccupancy: size,
      lockstepFirstTickDisplacement: 0.0045,
      lockstepFirstTickRadialProgress: 0.004,
      lockstepPoseHash: `${hashPrefix}10000000000000${hashPrefix}`,
      lockstepRadialGap: 0.003,
      lockstepSeparationNeighborDelta: 0,
      lockstepSpeedScale: 0.25,
      maximumAdoptionTick: classification.settleTickCount,
      maximumInitialWaypointDistance: 0.371,
      movementStartCoincidentAgentCount: size,
      setupValidationCounterDelta: counterDelta(),
      setupValidationUnchangedAgentCount: size,
      tickCount: 1,
    },
  }
}

function population(size) {
  return {
    activeAgentCount: size,
    anchorDigest: size === 14 ? '6000000000000006' : '7000000000000007',
    anchorNodeCount: size,
    bounds: {
      coldDrainTickCap: 5_000,
      connectorTickCap: 500,
      maximumRepairFirstServiceTicks: 60,
      maximumRepairHoldTicks: 60,
      productionTopologyRepairTickCap: 30,
      topologyTransitionTickCap: 60,
      targetDrainTickCap: 1_000,
    },
    coldDrainTicks: size === 14 ? 40 : 120,
    coldReadyAgentCount: size,
    maximumAnchorNodeOccupancy: size === 14 ? 1 : 4,
    navigationGraphNodeCount: 197,
    navigationOnly: true,
    noAudioEventDelta: 0,
    population: size,
    publicationTransitions: {
      lower: publicationTransition(size, 9, 10, size === 14 ? 'd' : 'e', 0),
      upper: publicationTransition(
        size,
        8,
        9,
        size === 14 ? 'b' : 'c',
        size === 14 ? 4 : 16,
        size === 14
          ? {}
            : {
              maximumRepairFirstServiceTicks: 50,
              maximumRepairHoldTicks: 53,
              repairInlineRecoveryWithoutFirstServiceCount: 2,
              settleTickCount: 53,
            },
      ),
    },
    reverseFieldAfter: reverseField(),
    reverseFieldBefore: reverseField(),
    sharedFourteenAnchorPrefixHash: '8000000000000008',
    target: {
      committedContentHash: 43_210,
      committedGeneration: 8,
      eventCount: 55,
      explicitRequestCount: 55,
      maximumStepWork: maximumStepWork(),
      physicsTickCount: 130,
      publicationHash: '9000000000000009',
      tickWorkHash: 'a00000000000000a',
      work: work(),
    },
    topologyTransitions: {
      lower: topologyTransition(
        size,
        11,
        12,
        size === 14 ? 3 : 12,
        size === 14
          ? {}
          : {
              maximumRepairFirstServiceTicks: 22,
              maximumRepairHoldTicks: 25,
              settleTickCount: 25,
            },
      ),
      upper: topologyTransition(
        size,
        10,
        11,
        size === 14 ? 5 : 18,
        size === 14
          ? {}
          : {
              maximumRepairFirstServiceTicks: 26,
              maximumRepairHoldTicks: 27,
              repairInlineRecoveryWithoutFirstServiceCount: 1,
              settleTickCount: 27,
            },
      ),
    },
    uniqueAnchorNodeCount: size === 14 ? 14 : 62,
  }
}

function traceSamples() {
  return Array.from({ length: 53 }, (_, index) => ({
    index,
    x: -27,
    y: 0,
    z: -17.5 + (3 * index) / 52,
  }))
}

function validResult() {
  const before = fingerprint()
  return {
    connector: {
      chainId: 'production-stair-chain',
      connectorId: 'production-stair-0',
      connectorIndex: 0,
      lowerLayerIndex: 0,
      lowerSourceNode: 12,
      lowerTargetNode: 20,
      upperLayerIndex: 1,
      upperSourceNode: 98,
      upperTargetNode: 106,
      functionalCorrectnessOnly: true,
      planHash: 'c00000000000000c',
      refreshDelta: counterDelta({
        intentIssued: 2,
        intentResolved: 2,
        intentResolveSlices: 2,
        searchStarted: 2,
      }),
      witnessHash: 'd00000000000000d',
      witnesses: [witness('lower-to-upper'), witness('upper-to-lower')],
      workHash: 'e00000000000000e',
    },
    fixedDeltaSeconds: 1 / 60,
    navigationOnlyLimitation:
      'This proves production navigation scheduling, bounded topology-change repair, stable publication adoption, and current-generation route movement; repeated anchor poses mean it does not claim crowd collision latency, rendering, animation, audio, projectiles, networking, or total-frame scaling.',
    populations: [population(14), population(100)],
    schemaVersion: 7,
    trace: {
      hash: 'b00000000000000b',
      recordedBreachBlockerIds: ['door_house_kitchen_back', 'item_g_kitchen_run'],
      recordedBuildingScopeId: 'parcel:parcel-02',
      recordedDoorFixedStepCount: 52,
      recordedDoorId: 'door_house_kitchen_back',
      recordedInsideWorld: { x: -27, y: 0, z: -14.5 },
      recordedLevelId: 'level_landrush-parcel-1msovbflbvkdc-0',
      recordedOutsideWorld: { x: -27, y: 0, z: -17.5 },
      requestCount: 53,
      samples: traceSamples(),
    },
    world: {
      activationRevision: 3,
      collisionWorldGeneration: 7,
      connectorCount: 4,
      fingerprintAfter: { ...before },
      fingerprintBefore: before,
      layerCount: 2,
      navigationMode: 'sparse',
      nodeCount: 197,
      revision: 'production-world:12',
    },
  }
}

function assertIssueIncludes(result, expected) {
  const issues = zombieNavigationScaleProofIssues(result)
  assert.ok(
    issues.some((issue) => issue.includes(expected)),
    `Expected an issue containing ${JSON.stringify(expected)}; received ${JSON.stringify(issues)}`,
  )
}

test('accepts a JSON-serializable production-scheduler proof at 14 and 100 agents', () => {
  const result = JSON.parse(JSON.stringify(validResult()))
  assert.deepEqual(zombieNavigationScaleProofIssues(result), [])
  assert.deepEqual(summarizeZombieNavigationScaleProof(result), {
    fixedDeltaSeconds: 1 / 60,
    navigationOnly: true,
    populations: [
      {
        coldDrainTicks: 40,
        eventCount: 55,
        maximumAnchorNodeOccupancy: 1,
        population: 14,
        publicationCount: 4,
        publicationRepairLatencyTicks: {
          lower: {
            firstService: 0,
            firstServiceAgentCount: 0,
            hold: 0,
            holdAgentCount: 0,
            inlineRecoveryWithoutFirstServiceAgentCount: 0,
          },
          upper: {
            firstService: 1,
            firstServiceAgentCount: 4,
            hold: 2,
            holdAgentCount: 4,
            inlineRecoveryWithoutFirstServiceAgentCount: 0,
          },
        },
        publicationSettleTicks: { lower: 1, upper: 2 },
        targetWork: work(),
        topologyRepairLatencyTicks: {
          lower: {
            firstService: 1,
            firstServiceAgentCount: 3,
            hold: 2,
            holdAgentCount: 3,
            inlineRecoveryWithoutFirstServiceAgentCount: 0,
          },
          upper: {
            firstService: 1,
            firstServiceAgentCount: 5,
            hold: 2,
            holdAgentCount: 5,
            inlineRecoveryWithoutFirstServiceAgentCount: 0,
          },
        },
        topologyTransitionSettleTicks: { lower: 2, upper: 2 },
        uniqueAnchorNodeCount: 14,
      },
      {
        coldDrainTicks: 120,
        eventCount: 55,
        maximumAnchorNodeOccupancy: 4,
        population: 100,
        publicationCount: 4,
        publicationRepairLatencyTicks: {
          lower: {
            firstService: 0,
            firstServiceAgentCount: 0,
            hold: 0,
            holdAgentCount: 0,
            inlineRecoveryWithoutFirstServiceAgentCount: 0,
          },
          upper: {
            firstService: 50,
            firstServiceAgentCount: 14,
            hold: 53,
            holdAgentCount: 16,
            inlineRecoveryWithoutFirstServiceAgentCount: 2,
          },
        },
        publicationSettleTicks: { lower: 1, upper: 53 },
        targetWork: work(),
        topologyRepairLatencyTicks: {
          lower: {
            firstService: 22,
            firstServiceAgentCount: 12,
            hold: 25,
            holdAgentCount: 12,
            inlineRecoveryWithoutFirstServiceAgentCount: 0,
          },
          upper: {
            firstService: 26,
            firstServiceAgentCount: 17,
            hold: 27,
            holdAgentCount: 18,
            inlineRecoveryWithoutFirstServiceAgentCount: 1,
          },
        },
        topologyTransitionSettleTicks: { lower: 25, upper: 27 },
        uniqueAnchorNodeCount: 62,
      },
    ],
    topologyHash: '5000000000000005',
    traceBreachBlockerIds: ['door_house_kitchen_back', 'item_g_kitchen_run'],
    traceHash: 'b00000000000000b',
    traceRequestCount: 53,
  })
})

test('accepts both immediate and bounded-repair lower publication adoption', () => {
  const result = validResult()
  for (const population of result.populations) {
    const size = population.population
    population.publicationTransitions.lower = publicationTransition(
      size,
      9,
      10,
      size === 14 ? 'd' : 'e',
      size,
      {
        maximumRepairFirstServiceTicks: 1,
        maximumRepairHoldTicks: 2,
        repairInlineRecoveryWithoutFirstServiceCount: size - 8,
        settleTickCount: 2,
      },
    )
  }
  assert.deepEqual(zombieNavigationScaleProofIssues(result), [])
})

test('pins compact and full target scheduler caps at the 256-node boundary', () => {
  const cases = [
    {
      caps: { candidateVisits: 248, graphEdgeVisits: 512, heapOperations: 504 },
      nodeCount: 256,
    },
    {
      caps: { candidateVisits: 1016, graphEdgeVisits: 1024, heapOperations: 3064 },
      nodeCount: 257,
    },
  ]
  for (const { caps, nodeCount } of cases) {
    const result = validResult()
    result.world.nodeCount = nodeCount
    for (const population of result.populations) {
      population.navigationGraphNodeCount = nodeCount
      population.target.maximumStepWork = maximumStepWork({
        ...caps,
        collisionPredicates: 56,
        hierarchyNodeVisits: 248,
        supportPredicates: 120,
      })
    }
    assert.deepEqual(zombieNavigationScaleProofIssues(result), [])

    for (const [key, cap] of Object.entries(caps)) {
      const overBudget = structuredClone(result)
      overBudget.populations[0].target.maximumStepWork[key] = cap + 1
      assertIssueIncludes(
        overBudget,
        `population 14.target.maximumStepWork.${key}=${String(cap + 1)} (cap ${String(cap)})`,
      )
    }
  }
})

test('rejects population-dependent production target work and hashes', () => {
  const result = validResult()
  result.populations[1].target.work.heapOperations += 1
  result.populations[1].target.tickWorkHash = 'c00000000000000c'
  assertIssueIncludes(result, '14/100 target work differs')
  assertIssueIncludes(result, '14/100 target tickWorkHash differs')
})

test('rejects per-agent work on a stable target publication', () => {
  const result = validResult()
  result.populations[1].publicationTransitions.lower.frozen.counterDelta.intentIssued = 100
  assertIssueIncludes(
    result,
    'population 100.publicationTransitions.lower.frozen.counterDelta demand conservation=100/0/0/0',
  )
})

test('rejects unbounded corridor inspection and stale movement semantics', () => {
  const result = validResult()
  result.populations[1].publicationTransitions.lower.frozen.maximumSuccessorVisits = 198
  result.populations[1].publicationTransitions.lower.frozen.maximumRepairHoldTicks = 1
  result.populations[1].publicationTransitions.lower.movement.tickCount = 2
  result.populations[1].publicationTransitions.lower.movement.currentGenerationMovementOnly = false
  assertIssueIncludes(result, 'maximumSuccessorVisits=198 (cap 197)')
  assertIssueIncludes(result, 'maximumRepairHoldTicks=1 (cap 60)')
  assertIssueIncludes(result, 'movement.tickCount=2')
  assertIssueIncludes(result, 'movement.currentGenerationMovementOnly is not true')
})

test('rejects topology repair fanout, fairness, service-budget, and settle violations', () => {
  const result = validResult()
  const transition = result.populations[1].topologyTransitions.upper
  transition.frozen.publicationAdoptedAgentCount = -1
  transition.frozen.publicationRepairAgentCount = 101
  transition.frozen.counterDelta.intentIssued = 101
  transition.frozen.counterDelta.intentResolved = 101
  transition.frozen.counterDelta.searchStarted = 101
  transition.frozen.maximumAgentServiceSlicesPerTick = 9
  transition.frozen.maximumFirstServiceAgeTicks = 14
  transition.frozen.maximumRepairFirstServiceTicks = 31
  transition.frozen.maximumRepairHoldTicks = 31
  transition.frozen.settleTickCount = 31
  assertIssueIncludes(result, 'publicationRepairAgentCount=101')
  assertIssueIncludes(result, 'maximumAgentServiceSlicesPerTick=9 (cap 8)')
  assertIssueIncludes(result, 'maximumFirstServiceAgeTicks=14 (cap 13)')
  assertIssueIncludes(result, 'maximumRepairFirstServiceTicks=31 (cap 30)')
  assertIssueIncludes(result, 'maximumRepairHoldTicks=31 (cap 30)')
  assertIssueIncludes(result, 'settleTickCount=31 (cap 30)')
})

test('rejects repair cohort, runtime attribution, and cancellation mismatches', () => {
  const result = validResult()
  const frozen = result.populations[1].publicationTransitions.upper.frozen
  frozen.repairHoldObservedCount = 15
  frozen.counterDelta.inlineRecoveryWithoutFirstService = 1
  frozen.counterDelta.intentCanceled = 1
  frozen.counterDelta.intentFirstService = 13
  frozen.counterDelta.intentResolveSlices = 15
  frozen.counterDelta.routePublishedDemand = 15
  frozen.counterDelta.searchStarted = 15
  assertIssueIncludes(result, 'repairHoldObservedCount=15')
  assertIssueIncludes(result, 'counterDelta demand conservation=16/15/16/15')
  assertIssueIncludes(result, 'counterDelta resolution classification=16/13/1')
  assertIssueIncludes(result, 'counterDelta.intentCanceled=1')
  frozen.counterDelta.searchStarted = 18
  assertIssueIncludes(result, 'counterDelta unique search starts=18 (issued 16)')
})

test('rejects the superseded schema-v6 result', () => {
  const result = validResult()
  result.schemaVersion = 6
  assertIssueIncludes(result, 'schemaVersion=6')
})

test('rejects same-node-count topology or active-mask mutation during the proof', () => {
  const result = validResult()
  result.world.fingerprintAfter.topologyHash = 'd00000000000000d'
  result.world.fingerprintAfter.combinedHash = 'e00000000000000e'
  assertIssueIncludes(result, 'world topology, active mask, signature, or semantics changed during proof')
})

test('rejects a world without authenticated closed breakable recorded-door semantics', () => {
  const result = validResult()
  result.world.fingerprintBefore.requiredDoorClosedBreakable = false
  result.world.fingerprintAfter.requiredDoorClosedBreakable = false
  assertIssueIncludes(
    result,
    'world.fingerprintBefore does not authenticate the active closed breakable recorded door',
  )
})

test('requires completed connector witnesses in both directions', () => {
  const result = validResult()
  result.connector.witnesses[1].completed = false
  result.connector.witnesses[1].waypointAdvanced = false
  result.connector.witnesses[1].startLayerIndex = 0
  assertIssueIncludes(result, 'connector.witnesses[1] did not complete')
  assertIssueIncludes(result, 'connector.witnesses[1] did not advance its anchor')
  assertIssueIncludes(result, 'connector.witnesses[1].startLayerIndex=0')
})

test('rejects fixed repair deadline and per-step work cap violations', () => {
  const result = validResult()
  result.populations[0].coldDrainTicks = result.populations[0].bounds.coldDrainTickCap + 1
  result.populations[0].target.maximumStepWork.graphEdgeVisits = 513
  result.populations[0].target.physicsTickCount = 6_054
  assertIssueIncludes(result, 'population 14.coldDrainTicks=5001 (cap 5000)')
  assertIssueIncludes(result, 'population 14.target.maximumStepWork.graphEdgeVisits=513 (cap 512)')
  assertIssueIncludes(result, 'population 14.target.physicsTickCount=6054 (cap 6053)')
})

test('rejects a broken recorded trace and connector indices outside live topology', () => {
  const result = validResult()
  result.trace.samples[9].z += 0.25
  result.trace.recordedBreachBlockerIds.reverse()
  result.connector.connectorIndex = result.world.connectorCount
  result.connector.upperTargetNode = result.world.nodeCount
  assertIssueIncludes(result, 'trace.samples[9] breaks recorded 60 Hz continuity')
  assertIssueIncludes(result, 'trace.recordedBreachBlockerIds=')
  assertIssueIncludes(result, 'connector.connectorIndex=4 is out of range')
  assertIssueIncludes(result, 'connector.upperTargetNode=197 is out of range')
})

test('rejects malformed isolated connector completion work', () => {
  const result = validResult()
  result.connector.refreshDelta.intentResolveSlices = -1
  assertIssueIncludes(result, 'connector.refreshDelta.intentResolveSlices=-1')
})

test('fails closed on malformed populations without pinning a topology node count', () => {
  const arbitraryTopology = validResult()
  arbitraryTopology.world.nodeCount = 311
  for (const population of arbitraryTopology.populations) {
    population.navigationGraphNodeCount = 311
  }
  assert.deepEqual(zombieNavigationScaleProofIssues(arbitraryTopology), [])

  const malformed = validResult()
  malformed.populations[1] = null
  assertIssueIncludes(malformed, 'population 100 is missing')
})

test('keeps the heavy proof query-gated and outside measured observer work', () => {
  const params = new URLSearchParams(scenario.urlParams())
  assert.equal(params.get('landrushNavScaleProof'), '1')
  assert.equal(params.get('landrushZombieRoomSoak'), '1')
  assert.equal(params.get('game'), 'zombie-escape')
  assert.equal(scenario.lifecycle.captureInitialCheckpoint, false)
  assert.equal(scenario.lifecycle.prepareAfterWarmup, true)
  assert.equal(scenario.lifecycle.settleBeforeMeasurement, true)
})
